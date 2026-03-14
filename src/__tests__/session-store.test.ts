import { describe, it, expect, beforeEach } from "@jest/globals";
import { SessionStore } from "../session-store.js";

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  it("starts empty", () => {
    expect(store.size()).toBe(0);
  });

  it("stores and retrieves a mapping", () => {
    const mapping = store.set({
      feishuRootMessageId: "msg-001",
      opencodeSessionId: "session-abc",
    });

    expect(mapping.feishuRootMessageId).toBe("msg-001");
    expect(mapping.opencodeSessionId).toBe("session-abc");
    expect(mapping.createdAt).toBeInstanceOf(Date);
    expect(mapping.updatedAt).toBeInstanceOf(Date);

    const retrieved = store.get("msg-001");
    expect(retrieved).toBeDefined();
    expect(retrieved?.opencodeSessionId).toBe("session-abc");
  });

  it("returns undefined for unknown keys", () => {
    expect(store.get("unknown")).toBeUndefined();
  });

  it("updates lastReplyMessageId", () => {
    store.set({
      feishuRootMessageId: "msg-002",
      opencodeSessionId: "session-def",
    });

    store.updateLastReply("msg-002", "reply-123");

    const entry = store.get("msg-002");
    expect(entry?.lastReplyMessageId).toBe("reply-123");
  });

  it("does nothing when updating unknown key", () => {
    // Should not throw
    expect(() => store.updateLastReply("missing", "reply-999")).not.toThrow();
  });

  it("deletes a mapping", () => {
    store.set({
      feishuRootMessageId: "msg-003",
      opencodeSessionId: "session-ghi",
    });

    expect(store.size()).toBe(1);
    store.delete("msg-003");
    expect(store.size()).toBe(0);
    expect(store.get("msg-003")).toBeUndefined();
  });

  it("correctly counts multiple entries", () => {
    store.set({ feishuRootMessageId: "a", opencodeSessionId: "s1" });
    store.set({ feishuRootMessageId: "b", opencodeSessionId: "s2" });
    store.set({ feishuRootMessageId: "c", opencodeSessionId: "s3" });
    expect(store.size()).toBe(3);
  });
});
