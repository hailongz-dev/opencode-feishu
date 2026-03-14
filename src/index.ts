import * as lark from "@larksuiteoapi/node-sdk";
import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { SessionStore } from "./session-store.js";
import { OpencodeService } from "./opencode.js";
import { FeishuHandler } from "./feishu-handler.js";

/**
 * OpenCode plugin that bridges Feishu/Lark messaging with OpenCode AI sessions.
 *
 * Configuration (via environment variables):
 *   FEISHU_APP_ID     — Feishu application ID
 *   FEISHU_APP_SECRET — Feishu application secret
 *
 * Add to your opencode.json:
 *   { "plugin": ["opencode-feishu"] }
 */
export const FeishuPlugin: Plugin = async (input) => {
  const appId = process.env["FEISHU_APP_ID"];
  const appSecret = process.env["FEISHU_APP_SECRET"];

  if (!appId || !appSecret) {
    console.warn(
      "[opencode-feishu] FEISHU_APP_ID or FEISHU_APP_SECRET is not set — plugin disabled"
    );
    return {} satisfies Hooks;
  }

  // Feishu SDK client (used for sending messages and downloading resources)
  const feishuClient = new lark.Client({
    appId,
    appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });

  // OpenCode service — uses the client provided by the plugin runtime
  const opencodeService = new OpencodeService(input.client);

  // Session mapping store (in-memory)
  const sessionStore = new SessionStore();

  // Feishu message handler (core business logic)
  const feishuHandler = new FeishuHandler(
    feishuClient,
    sessionStore,
    opencodeService
  );

  // Event dispatcher — registers handlers for incoming Feishu events
  const eventDispatcher = new lark.EventDispatcher({}).register({
    "im.message.receive_v1": async (data) => {
      await feishuHandler.handleMessageEvent(
        data as Parameters<typeof feishuHandler.handleMessageEvent>[0]
      );
    },
  });

  // WebSocket client — receives events via persistent connection (no HTTP server needed)
  const wsClient = new lark.WSClient({ appId, appSecret });

  // Start the WebSocket listener in the background; do not block plugin initialization
  wsClient.start({ eventDispatcher }).catch((err: unknown) => {
    console.error("[opencode-feishu] Feishu WebSocket error:", err);
  });

  console.log("[opencode-feishu] Feishu plugin started (WebSocket mode)");

  return {} satisfies Hooks;
};

export default FeishuPlugin;
