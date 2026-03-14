import * as lark from "@larksuiteoapi/node-sdk";
import type { Readable } from "node:stream";
import type {
  FeishuMessage,
  FeishuTextContent,
  FeishuImageContent,
  FeishuAudioContent,
  FeishuFileContent,
} from "./types.js";
import type { SessionStore } from "./session-store.js";
import type { OpencodeService, TextPartInput, FilePartInput } from "./opencode.js";

/**
 * Feishu im.message.receive_v1 event data shape (subset we care about).
 */
interface FeishuMessageEventData {
  sender: {
    sender_id?: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: FeishuMessage;
}

/**
 * Handles incoming Feishu messages, maps them to OpenCode sessions,
 * forwards the content to OpenCode, and replies with the model's response.
 */
export class FeishuHandler {
  private readonly feishuClient: lark.Client;
  private readonly sessionStore: SessionStore;
  private readonly opencodeService: OpencodeService;

  constructor(
    feishuClient: lark.Client,
    sessionStore: SessionStore,
    opencodeService: OpencodeService
  ) {
    this.feishuClient = feishuClient;
    this.sessionStore = sessionStore;
    this.opencodeService = opencodeService;
  }

  /**
   * Entry point called for every received im.message.receive_v1 event.
   * The SDK passes the raw event data; we extract the message and process it.
   */
  async handleMessageEvent(data: FeishuMessageEventData): Promise<void> {
    const message = data.message as FeishuMessage | undefined;
    if (!message) {
      console.warn("[FeishuHandler] Received event without message payload");
      return;
    }

    // Determine the root message ID for session tracking.
    // - If the incoming message is itself a reply, root_id points to the thread root.
    // - Otherwise the message itself is the root.
    const rootMessageId: string = message.root_id ?? message.message_id;

    try {
      // Build the prompt parts from the message content
      const parts = await this.buildPromptParts(message);
      if (parts.length === 0) {
        console.warn(
          `[FeishuHandler] Unsupported or empty message type: ${message.message_type}`
        );
        return;
      }

      // Find or create an OpenCode session for this thread
      let sessionId: string;
      const existing = this.sessionStore.get(rootMessageId);
      if (existing) {
        sessionId = existing.opencodeSessionId;
      } else {
        sessionId = await this.opencodeService.createSession(
          `Feishu ${message.chat_type} — ${message.message_id}`
        );
        this.sessionStore.set({
          feishuRootMessageId: rootMessageId,
          opencodeSessionId: sessionId,
        });
      }

      // Send the prompt and get the response
      const responseText = await this.opencodeService.prompt(sessionId, parts);

      if (!responseText) {
        console.warn("[FeishuHandler] Empty response from OpenCode");
        return;
      }

      // Reply in Feishu (threaded reply to the original message)
      const replyRes = await this.feishuClient.im.message.reply({
        path: { message_id: message.message_id },
        data: {
          content: JSON.stringify({ text: responseText }),
          msg_type: "text",
          reply_in_thread: true,
        },
      });

      const replyData = replyRes.data as { message_id?: string } | undefined;
      if (replyData?.message_id) {
        this.sessionStore.updateLastReply(rootMessageId, replyData.message_id);
      }
    } catch (err) {
      console.error("[FeishuHandler] Error processing message:", err);
    }
  }

  /**
   * Convert a Feishu message into a list of OpenCode prompt parts.
   * Supports: text, image, audio, file.
   */
  private async buildPromptParts(
    message: FeishuMessage
  ): Promise<Array<TextPartInput | FilePartInput>> {
    const parts: Array<TextPartInput | FilePartInput> = [];

    switch (message.message_type) {
      case "text": {
        const content = JSON.parse(message.content) as FeishuTextContent;
        const text = content.text?.trim();
        if (text) {
          parts.push({ type: "text", text } as TextPartInput);
        }
        break;
      }

      case "image": {
        const content = JSON.parse(message.content) as FeishuImageContent;
        const imageUrl = await this.getResourceDataUrl(
          message.message_id,
          content.image_key,
          "image"
        );
        if (imageUrl) {
          parts.push({
            type: "file",
            mime: "image/jpeg",
            url: imageUrl,
            filename: `${content.image_key}.jpg`,
          } as FilePartInput);
          parts.push({ type: "text", text: "[image attached]" } as TextPartInput);
        }
        break;
      }

      case "audio": {
        const content = JSON.parse(message.content) as FeishuAudioContent;
        // OpenCode does not natively transcribe audio; we download the file
        // and attach it so the model can acknowledge it, while also adding
        // a descriptive text part.
        const audioUrl = await this.getResourceDataUrl(
          message.message_id,
          content.file_key,
          "file"
        );
        if (audioUrl) {
          parts.push({
            type: "file",
            mime: "audio/mp4",
            url: audioUrl,
            filename: `${content.file_key}.mp4`,
          } as FilePartInput);
        }
        parts.push({
          type: "text",
          text: "[User sent a voice message. Audio is attached.]",
        } as TextPartInput);
        break;
      }

      case "file": {
        const content = JSON.parse(message.content) as FeishuFileContent;
        const fileUrl = await this.getResourceDataUrl(
          message.message_id,
          content.file_key,
          "file"
        );
        if (fileUrl) {
          parts.push({
            type: "file",
            mime: "application/octet-stream",
            url: fileUrl,
            filename: content.file_name ?? content.file_key,
          } as FilePartInput);
          parts.push({
            type: "text",
            text: `[User sent a file: ${content.file_name ?? content.file_key}]`,
          } as TextPartInput);
        }
        break;
      }

      default:
        // Unsupported message types (sticker, card, etc.) are silently ignored
        break;
    }

    return parts;
  }

  /**
   * Download a Feishu media resource and return it as a base64 data URL.
   *
   * The Feishu SDK returns an object with `getReadableStream()` instead of a
   * raw buffer.  We collect the stream chunks and base64-encode them.
   */
  private async getResourceDataUrl(
    messageId: string,
    key: string,
    type: "image" | "file"
  ): Promise<string | null> {
    try {
      const res = await this.feishuClient.im.messageResource.get({
        params: { type },
        path: { message_id: messageId, file_key: key },
      });

      const stream: Readable = res.getReadableStream();
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });

      const buffer = Buffer.concat(chunks);
      const mimeType =
        type === "image" ? "image/jpeg" : "application/octet-stream";
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch (err) {
      console.error(
        `[FeishuHandler] Failed to download resource ${key}:`,
        err
      );
      return null;
    }
  }
}
