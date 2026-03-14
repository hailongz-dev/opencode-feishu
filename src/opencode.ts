import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk/client";
import type {
  TextPartInput,
  FilePartInput,
} from "@opencode-ai/sdk";

export type { TextPartInput, FilePartInput };

/**
 * Wraps the OpenCode SDK client to provide session management helpers.
 */
export class OpencodeService {
  private readonly client: OpencodeClient;

  constructor(baseUrl: string) {
    this.client = createOpencodeClient({ baseUrl });
  }

  /**
   * Create a brand-new OpenCode session and return its ID.
   */
  async createSession(title?: string): Promise<string> {
    const res = await this.client.session.create({
      body: title ? { title } : undefined,
      throwOnError: true,
    });
    const data = res.data as { id: string };
    return data.id;
  }

  /**
   * Send a prompt to an existing session and wait for the model to finish.
   * Returns the text from the latest assistant message.
   *
   * `parts` can be a mix of text parts and file (image/document) parts.
   */
  async prompt(
    sessionId: string,
    parts: Array<TextPartInput | FilePartInput>
  ): Promise<string> {
    await this.client.session.prompt({
      path: { id: sessionId },
      body: { parts },
      throwOnError: true,
    });

    return this.getLastAssistantText(sessionId);
  }

  /**
   * Fetch the most recent assistant text from a session's message history.
   */
  async getLastAssistantText(sessionId: string): Promise<string> {
    const res = await this.client.session.messages({
      path: { id: sessionId },
      throwOnError: true,
    });

    const messages = res.data as unknown as Array<{
      info: { role: string };
      parts: Array<{ type: string; text?: string }>;
    }>;

    // Walk messages from newest to oldest to find the last assistant reply
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.info?.role === "assistant" && Array.isArray(msg.parts)) {
        const texts = msg.parts
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text as string);
        if (texts.length > 0) {
          return texts.join("\n");
        }
      }
    }

    return "";
  }
}
