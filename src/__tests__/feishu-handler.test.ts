import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { Readable } from "node:stream";
import { FeishuHandler } from "../feishu-handler.js";
import type { SessionStore } from "../session-store.js";
import type { OpencodeService } from "../opencode.js";

/**
 * Build a minimal FeishuHandler with mocked dependencies.
 */
function buildHandler(overrides?: {
  sessionStore?: Partial<SessionStore>;
  opencodeService?: Partial<OpencodeService>;
  feishuClient?: Record<string, unknown>;
}) {
  const mockReply = jest.fn<() => Promise<{ data: { message_id: string } }>>()
    .mockResolvedValue({ data: { message_id: "reply-001" } });

  const feishuClient = overrides?.feishuClient ?? {
    im: {
      message: {
        reply: mockReply,
      },
      messageResource: {
        get: jest.fn<() => Promise<{ getReadableStream: () => Readable }>>()
          .mockResolvedValue({
            getReadableStream: () => {
              const r = new Readable({ read() {} });
              r.push(Buffer.from("fake-image"));
              r.push(null);
              return r;
            },
          }),
      },
    },
  };

  const sessionStore: SessionStore = {
    get: jest.fn<SessionStore["get"]>().mockReturnValue(undefined),
    set: jest.fn<SessionStore["set"]>().mockReturnValue({ feishuRootMessageId: "root-001", opencodeSessionId: "sess-001", createdAt: new Date(), updatedAt: new Date() }),
    updateLastReply: jest.fn<SessionStore["updateLastReply"]>(),
    delete: jest.fn<SessionStore["delete"]>(),
    size: jest.fn<SessionStore["size"]>().mockReturnValue(0),
    ...overrides?.sessionStore,
  } as unknown as SessionStore;

  const opencodeService: OpencodeService = {
    createSession: jest.fn<OpencodeService["createSession"]>().mockResolvedValue("sess-001"),
    prompt: jest.fn<OpencodeService["prompt"]>().mockResolvedValue("Hello from OpenCode!"),
    getLastAssistantText: jest.fn<OpencodeService["getLastAssistantText"]>().mockResolvedValue("Hello from OpenCode!"),
    ...overrides?.opencodeService,
  } as unknown as OpencodeService;

  const handler = new FeishuHandler(
    feishuClient as never,
    sessionStore,
    opencodeService
  );

  return { handler, mockReply, sessionStore, opencodeService };
}

describe("FeishuHandler", () => {
  it("creates a new session for a fresh text message", async () => {
    const { handler, mockReply, sessionStore, opencodeService } = buildHandler();

    await handler.handleMessageEvent({
      sender: {} as never,
      message: {
        message_id: "msg-100",
        chat_id: "chat-001",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "Hello AI" }),
        create_time: "1700000000000",
      } as never,
    });

    expect(opencodeService.createSession).toHaveBeenCalledTimes(1);
    expect(opencodeService.prompt).toHaveBeenCalledWith("sess-001", [
      { type: "text", text: "Hello AI" },
    ]);
    expect(mockReply).toHaveBeenCalledTimes(1);
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { message_id: "msg-100" },
        data: expect.objectContaining({ msg_type: "text" }),
      })
    );
    expect(sessionStore.set).toHaveBeenCalledWith(
      expect.objectContaining({ opencodeSessionId: "sess-001" })
    );
  });

  it("reuses existing session when root_id is set", async () => {
    const { handler, opencodeService, sessionStore } = buildHandler({
      sessionStore: {
        get: jest.fn<SessionStore["get"]>().mockReturnValue({
          feishuRootMessageId: "root-001",
          opencodeSessionId: "existing-sess",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        set: jest.fn<SessionStore["set"]>(),
      },
    });

    await handler.handleMessageEvent({
      sender: {} as never,
      message: {
        message_id: "msg-200",
        root_id: "root-001",
        chat_id: "chat-001",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "Follow up question" }),
        create_time: "1700000001000",
      } as never,
    });

    // Should NOT create a new session
    expect(opencodeService.createSession).not.toHaveBeenCalled();
    // Should prompt the existing session
    expect(opencodeService.prompt).toHaveBeenCalledWith("existing-sess", expect.any(Array));
    expect(sessionStore.set).not.toHaveBeenCalled();
  });

  it("ignores messages with empty text content", async () => {
    const { handler, mockReply, opencodeService } = buildHandler();

    await handler.handleMessageEvent({
      sender: {} as never,
      message: {
        message_id: "msg-300",
        chat_id: "chat-001",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "   " }),
        create_time: "1700000002000",
      } as never,
    });

    expect(opencodeService.prompt).not.toHaveBeenCalled();
    expect(mockReply).not.toHaveBeenCalled();
  });

  it("handles image messages", async () => {
    const { handler, opencodeService, mockReply } = buildHandler();

    await handler.handleMessageEvent({
      sender: {} as never,
      message: {
        message_id: "msg-400",
        chat_id: "chat-001",
        chat_type: "p2p",
        message_type: "image",
        content: JSON.stringify({ image_key: "img_abc123" }),
        create_time: "1700000003000",
      } as never,
    });

    expect(opencodeService.prompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ type: "file", mime: "image/jpeg" }),
        expect.objectContaining({ type: "text", text: "[image attached]" }),
      ])
    );
    expect(mockReply).toHaveBeenCalledTimes(1);
  });

  it("handles audio messages", async () => {
    const { handler, opencodeService, mockReply } = buildHandler();

    await handler.handleMessageEvent({
      sender: {} as never,
      message: {
        message_id: "msg-500",
        chat_id: "chat-001",
        chat_type: "p2p",
        message_type: "audio",
        content: JSON.stringify({ file_key: "file_voice_xyz" }),
        create_time: "1700000004000",
      } as never,
    });

    expect(opencodeService.prompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("voice message") }),
      ])
    );
    expect(mockReply).toHaveBeenCalledTimes(1);
  });

  it("handles file messages", async () => {
    const { handler, opencodeService, mockReply } = buildHandler();

    await handler.handleMessageEvent({
      sender: {} as never,
      message: {
        message_id: "msg-600",
        chat_id: "chat-001",
        chat_type: "p2p",
        message_type: "file",
        content: JSON.stringify({ file_key: "file_doc_001", file_name: "report.pdf" }),
        create_time: "1700000005000",
      } as never,
    });

    expect(opencodeService.prompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ type: "file", filename: "report.pdf" }),
        expect.objectContaining({ type: "text", text: expect.stringContaining("report.pdf") }),
      ])
    );
    expect(mockReply).toHaveBeenCalledTimes(1);
  });

  it("does not reply when OpenCode returns empty response", async () => {
    const { handler, mockReply } = buildHandler({
      opencodeService: {
        createSession: jest.fn<OpencodeService["createSession"]>().mockResolvedValue("sess-001"),
        prompt: jest.fn<OpencodeService["prompt"]>().mockResolvedValue(""),
        getLastAssistantText: jest.fn<OpencodeService["getLastAssistantText"]>().mockResolvedValue(""),
      },
    });

    await handler.handleMessageEvent({
      sender: {} as never,
      message: {
        message_id: "msg-700",
        chat_id: "chat-001",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "hello" }),
        create_time: "1700000006000",
      } as never,
    });

    expect(mockReply).not.toHaveBeenCalled();
  });
});
