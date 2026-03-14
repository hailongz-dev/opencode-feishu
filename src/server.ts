import express from "express";
import * as lark from "@larksuiteoapi/node-sdk";
import type { FeishuHandler } from "./feishu-handler.js";

/**
 * Creates and configures the Express application that receives Feishu
 * webhook callback events.
 *
 * Feishu sends POST requests to the configured callback URL.  The SDK's
 * `adaptExpress` middleware handles signature verification and dispatches
 * events to registered handlers.
 */
export function createServer(
  feishuClient: lark.Client,
  feishuHandler: FeishuHandler,
  verificationToken?: string,
  encryptKey?: string
): express.Application {
  const app = express();
  app.use(express.json());

  // Build the event dispatcher
  const dispatcher = new lark.EventDispatcher({
    verificationToken: verificationToken ?? "",
    encryptKey: encryptKey ?? "",
  }).register({
    "im.message.receive_v1": async (data) => {
      await feishuHandler.handleMessageEvent(data as Parameters<typeof feishuHandler.handleMessageEvent>[0]);
    },
  });

  // Attach the Feishu middleware at /webhook/feishu
  // This path must match the callback URL configured in the Feishu developer console
  app.use(
    "/webhook/feishu",
    lark.adaptExpress(dispatcher, { autoChallenge: true })
  );

  // Health-check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
