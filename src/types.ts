/**
 * Feishu message content types received via im.message.receive_v1 event
 */

export interface FeishuTextContent {
  text: string;
}

export interface FeishuImageContent {
  image_key: string;
}

export interface FeishuAudioContent {
  file_key: string;
  duration?: number;
}

export interface FeishuFileContent {
  file_key: string;
  file_name?: string;
}

export type FeishuMessageContent =
  | FeishuTextContent
  | FeishuImageContent
  | FeishuAudioContent
  | FeishuFileContent;

/**
 * Feishu message types supported by this plugin.
 * The SDK uses `message_type` (not `msg_type`) in the event payload.
 */
export type FeishuMessageType = "text" | "image" | "audio" | "file" | "post";

/**
 * Feishu message event data (from im.message.receive_v1).
 * Field names match the real SDK payload.
 */
export interface FeishuMessage {
  message_id: string;
  /** ID of the thread-root message (present when the message is in a thread) */
  root_id?: string;
  /** ID of the directly-replied-to message */
  parent_id?: string;
  create_time: string;
  chat_id: string;
  chat_type: string;
  /** The Feishu SDK uses `message_type`, not `msg_type` */
  message_type: FeishuMessageType;
  content: string;
  mentions?: Array<{
    key: string;
    id: {
      open_id?: string;
      union_id?: string;
      user_id?: string;
    };
    name: string;
    tenant_key?: string;
  }>;
}

/**
 * Maps a Feishu root-message ID to an OpenCode session ID.
 * The root-message is the first message that started a conversation thread.
 */
export interface SessionMapping {
  feishuRootMessageId: string;
  opencodeSessionId: string;
  /** The Feishu message ID of the most recent bot reply, used for threaded replies */
  lastReplyMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Result of processing a Feishu message
 */
export interface MessageProcessResult {
  success: boolean;
  sessionId?: string;
  replyMessageId?: string;
  error?: string;
}

/**
 * Configuration options for the Feishu handler
 */
export interface FeishuHandlerConfig {
  feishuAppId: string;
  feishuAppSecret: string;
  opencodeBaseUrl: string;
}
