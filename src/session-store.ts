import type { SessionMapping } from "./types.js";

/**
 * In-memory store that maps Feishu root-message IDs to OpenCode session IDs.
 *
 * Keyed by `feishuRootMessageId` (the `root_id` or `message_id` when no parent
 * exists).  A persistent store (Redis, SQLite, etc.) can replace this class
 * by implementing the same interface.
 */
export class SessionStore {
  private readonly store = new Map<string, SessionMapping>();

  /**
   * Look up the OpenCode session that corresponds to a Feishu root message.
   */
  get(feishuRootMessageId: string): SessionMapping | undefined {
    return this.store.get(feishuRootMessageId);
  }

  /**
   * Persist a new mapping.
   */
  set(mapping: Omit<SessionMapping, "createdAt" | "updatedAt">): SessionMapping {
    const now = new Date();
    const entry: SessionMapping = { ...mapping, createdAt: now, updatedAt: now };
    this.store.set(mapping.feishuRootMessageId, entry);
    return entry;
  }

  /**
   * Update the `lastReplyMessageId` after the bot has replied.
   */
  updateLastReply(feishuRootMessageId: string, lastReplyMessageId: string): void {
    const entry = this.store.get(feishuRootMessageId);
    if (entry) {
      entry.lastReplyMessageId = lastReplyMessageId;
      entry.updatedAt = new Date();
    }
  }

  /**
   * Remove a mapping (e.g., when a session is closed).
   */
  delete(feishuRootMessageId: string): void {
    this.store.delete(feishuRootMessageId);
  }

  /**
   * Returns the total number of tracked sessions.
   */
  size(): number {
    return this.store.size;
  }
}
