/**
 * lib/telegram.ts — Telegram Client Factory & Admin Session Utility
 *
 * Two responsibilities:
 *   1. TG_CONFIG — shared connection options used by every TelegramClient
 *      instance in the app (both the pooled user clients and the pending-auth
 *      clients). Centralising these prevents drift between instances.
 *
 *   2. createTelegramClient(sessionString?) — factory function that builds a
 *      TelegramClient without connecting it. Connection is intentionally
 *      deferred to TelegramManager so the pool can control when and how many
 *      connections are open.
 *
 *   3. initAdminSession() — CLI helper (run once, manually) to generate the
 *      TG_STRING_SESSION value that goes in .env. Never call this from
 *      application code.
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { input, password } from "@inquirer/prompts";
import { config } from "dotenv";

config();

/**
 * Shared Telegram API credentials and connection tuning.
 * Obtain TG_API_ID and TG_API_HASH from https://my.telegram.org/apps
 */
export const TG_CONFIG = {
  apiId: Number(process.env.TG_API_ID),
  apiHash: process.env.TG_API_HASH!,
  connectionOptions: {
    connectionRetries: 3,      // Fail fast and let the caller retry rather than hanging
    requestRetries: 2,         // Minimise time spent on a single stuck request
    floodSleepThreshold: 60,   // Abort rather than sleeping >60 s on flood errors
    autoReconnect: true,       // Transparently reconnect on network drops
    deviceModel: "High-Speed Streamer",
    systemVersion: "Node.js 20",
  },
};

/**
 * Creates (but does NOT connect) a TelegramClient.
 *
 * Session priority:
 *   1. Explicitly passed sessionString  — used for individual user clients
 *   2. TG_STRING_SESSION env variable   — used for the system/admin client
 *   3. Empty string                     — starts a brand-new session (login flow)
 */
export function createTelegramClient(sessionString?: string) {
  const session = new StringSession(
    sessionString || process.env.TG_STRING_SESSION || "",
  );

  return new TelegramClient(
    session,
    TG_CONFIG.apiId,
    TG_CONFIG.apiHash,
    TG_CONFIG.connectionOptions,
  );
}

/**
 * initAdminSession — One-time CLI utility for generating TG_STRING_SESSION.
 *
 * Run this script manually from the terminal:
 *   npx tsx src/lib/telegram.ts
 *
 * It will prompt for a phone number, SMS code, and optional 2FA password,
 * then print the session string to copy into your .env file.
 * The session string grants full account access — treat it like a password.
 */
export const initAdminSession = async () => {
  const client = createTelegramClient("");

  console.log("🚀 Starting Admin Session Creation...");

  await client.start({
    phoneNumber: async () =>
      await input({ message: "Enter Admin Phone (+233...):" }),
    phoneCode: async () => await input({ message: "Enter SMS code:" }),
    password: async () =>
      await password({ message: "Enter 2FA password (if any):" }),
    onError: (err) => console.error("❌ Login Error:", err.message),
  });

  const sessionString = client.session.save() as unknown as string;
  const me = await client.getMe();

  console.log("\n" + "=".repeat(40));
  console.log(`✅ Logged in as: ${me.firstName}`);
  console.log(`🔑 SESSION STRING:\n\n${sessionString}\n`);
  console.log("=".repeat(40));
  console.log("👉 Copy this into your .env as TG_STRING_SESSION");

  await client.disconnect();
  return sessionString;
};
