import "dotenv/config";
import * as lark from "@larksuiteoapi/node-sdk";
import { SessionStore } from "./session-store.js";
import { OpencodeService } from "./opencode.js";
import { FeishuHandler } from "./feishu-handler.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const appId = requireEnv("FEISHU_APP_ID");
  const appSecret = requireEnv("FEISHU_APP_SECRET");
  const opencodeBaseUrl =
    process.env["OPENCODE_BASE_URL"] ?? "http://localhost:4096";

  // Feishu SDK client (used for sending messages and downloading resources)
  const feishuClient = new lark.Client({
    appId,
    appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });

  // OpenCode service
  const opencodeService = new OpencodeService(opencodeBaseUrl);

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

  console.log(`opencode-feishu starting (WebSocket mode)`);
  console.log(`  OpenCode base URL: ${opencodeBaseUrl}`);

  await wsClient.start({ eventDispatcher });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
