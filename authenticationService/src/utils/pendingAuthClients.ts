/**
 * utils/pendingAuthClients.ts — Temporary Telegram Client Store (Login Flow)
 *
 * The Telegram OTP login is a two-step process:
 *   Step 1 (requestLoginCode)  — Connect a fresh client, call sendCode, store
 *                                the client in this Map keyed by phone number.
 *   Step 2 (verifyTelegramLogin resolver) — Retrieve the same client, call
 *                                SignIn with the OTP, extract the session string.
 *
 * Why keep the client alive between steps?
 * Telegram's auth flow requires the SAME connection that requested the code to
 * also submit the code. A new connection would fail with AUTH_KEY_UNREGISTERED.
 *
 * Memory safety:
 * Each entry has a 15-minute self-destruct timer. If the user never completes
 * Step 2, the client is disconnected, the map entry is removed, and the
 * incomplete user account is deleted from MongoDB.
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { TG_CONFIG } from "../lib/telegram.js";
import { User } from "../models/User.js";

/**
 * In-memory store for pending login clients.
 * Key: phone number (e.g. "+233201234567")
 * Value: { client: live TelegramClient, timeout: self-destruct timer handle }
 */
const pendingAuth = new Map<string, { client: TelegramClient; timeout: any }>();

/**
 * Step 1 of the Telegram login flow.
 * Creates a fresh TelegramClient, connects it, and requests an SMS/app code.
 *
 * @param phoneNumber - The user's phone number in international format
 * @returns { success, phoneCodeHash, message }
 *          phoneCodeHash must be stored on the User document and passed back
 *          in Step 2 (SignIn RPC call).
 */
export const requestLoginCode = async (phoneNumber: string) => {
  // Clean up any previous attempt for this number (e.g. user requested a resend)
  if (pendingAuth.has(phoneNumber)) {
    const existing = pendingAuth.get(phoneNumber);
    clearTimeout(existing?.timeout);
    await existing?.client.disconnect();
    pendingAuth.delete(phoneNumber);
  }

  // Create a brand-new client with an empty session (no prior auth state)
  const client = new TelegramClient(
    new StringSession(""),
    TG_CONFIG.apiId,
    TG_CONFIG.apiHash,
    TG_CONFIG.connectionOptions,
  );

  try {
    await client.connect();

    // sendCode triggers Telegram to send the OTP to the user's phone/app
    const { phoneCodeHash } = await client.sendCode(
      { apiId: TG_CONFIG.apiId, apiHash: TG_CONFIG.apiHash },
      phoneNumber,
    );

    // ── 15-MINUTE SELF-DESTRUCT ──────────────────────────────────────────────
    // If the user doesn't complete Step 2 within 15 minutes:
    //   1. Disconnect and remove the pending Telegram client (memory safety)
    //   2. Delete the user account — they never finished verification, so the
    //      account is incomplete and should not persist in the database.
    const timeout = setTimeout(
      async () => {
        if (pendingAuth.has(phoneNumber)) {
          console.log(
            `🧹 Cleaning up expired login attempt for: ${phoneNumber}`,
          );
          const expired = pendingAuth.get(phoneNumber);
          await expired?.client.disconnect();
          pendingAuth.delete(phoneNumber);

          // Delete the unverified user account
          const deleted = await User.findOneAndDelete({ phoneNumber });
          if (deleted) {
            console.log(`🗑️  Deleted unverified account for: ${phoneNumber}`);
          }
        }
      },
      15 * 60 * 1000,
    );

    pendingAuth.set(phoneNumber, { client, timeout });

    return { success: true, phoneCodeHash, message: "Code sent successfully." };
  } catch (error: any) {
    await client.disconnect();
    return { success: false, message: error.message };
  }
};

/**
 * Retrieves the live client for a phone number that is mid-login.
 * Returns null if the entry has expired or never existed.
 */
export const getPendingClient = (phoneNumber: string) => {
  const entry = pendingAuth.get(phoneNumber);
  return entry ? entry.client : null;
};

/**
 * Removes a pending client after a successful login (Step 2 complete).
 * Clears the self-destruct timer since we no longer need it.
 */
export const clearPendingClient = (phoneNumber: string) => {
  const entry = pendingAuth.get(phoneNumber);
  if (entry) {
    clearTimeout(entry.timeout);
    pendingAuth.delete(phoneNumber);
  }
};
