import "dotenv/config";
import * as lark from "@larksuiteoapi/node-sdk";
import { SessionStore } from "./session-store.js";
import { OpencodeService } from "./opencode.js";
import { FeishuHandler } from "./feishu-handler.js";
import { createServer } from "./server.js";

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
  const verificationToken = process.env["FEISHU_VERIFICATION_TOKEN"];
  const encryptKey = process.env["FEISHU_ENCRYPT_KEY"];
  const opencodeBaseUrl =
    process.env["OPENCODE_BASE_URL"] ?? "http://localhost:4096";
  const port = parseInt(process.env["PORT"] ?? "3000", 10);

  // Feishu SDK client
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

  // HTTP server
  const app = createServer(
    feishuClient,
    feishuHandler,
    verificationToken,
    encryptKey
  );

  app.listen(port, () => {
    console.log(`opencode-feishu server listening on port ${port}`);
    console.log(`  Webhook endpoint: POST /webhook/feishu`);
    console.log(`  Health check:     GET  /health`);
    console.log(`  OpenCode base URL: ${opencodeBaseUrl}`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
