/**
 * signupResolvers/verifyTelegramLogin.ts — OTP Verification Mutation (Step 2)
 *
 * Completes the two-step Telegram authentication flow started by registerUser.
 *
 * Flow:
 *   1. Retrieve the live pending TelegramClient for this user's phone number.
 *      (The client was created and stored in pendingAuthClients.ts during Step 1.)
 *   2. Call Telegram's auth.SignIn RPC with the OTP code the user received.
 *   3. Call processEntities() to ensure the session captures the full auth state.
 *   4. Extract and save the session string to the User document.
 *   5. Clear the temporary phoneCodeHash (single-use, no longer needed).
 *   6. Remove the client from the pending map.
 *   7. Hand the already-connected client to TelegramManager (warm-up win).
 *
 * Why reuse the same client?
 * Telegram requires the SAME connection that requested the code to also submit
 * it. A new connection would fail with AUTH_KEY_UNREGISTERED.
 *
 * The warm-up in step 7 means the user's first stream request won't pay the
 * ~1-2 second MTProto connection cost.
 */

import { Api } from "telegram";
import { AppError } from "../../../utils/AppError.js";
import {
  clearPendingClient,
  getPendingClient,
} from "../../../utils/pendingAuthClients.js";
import { User } from "../../../models/User.js";
import { telegramManager } from "../../../lib/telegramManager.js";

export const verifyTelegramLogin = async (
  _: any,
  { input }: any,
  { user }: any,
) => {
  if (!user) throw new AppError("Unauthorized", 401);

  // Retrieve the live client that was stored during registerUser
  const client = getPendingClient(user.phoneNumber);
  if (!client)
    throw new AppError("Session expired. Please request a new code.", 400);

  try {
    const result = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: user.phoneNumber,
        phoneCodeHash: user.phoneCodeHash, // Stored on the user doc during registerUser
        phoneCode: input.code,
      }),
    );

    // Ensure the session string captures the full authenticated state
    client.session.processEntities(result);
    const sessionString = client.session.save() as unknown as string;

    // Persist the session and clear the one-time OTP hash
    const updatedUser = await User.findByIdAndUpdate(
      user.id,
      { sessionString, phoneCodeHash: null },
      { new: true },
    );

    clearPendingClient(user.phoneNumber);

    // Transfer the already-connected client into the pool — first stream is instant
    await telegramManager.getClient(user.id, sessionString);

    return updatedUser;
  } catch (error: any) {
    if (error.errorMessage === "SESSION_PASSWORD_NEEDED") {
      throw new AppError("2FA_REQUIRED", 403);
    }
    throw new AppError(`Verification failed: ${error.message}`, 400);
  }
};
