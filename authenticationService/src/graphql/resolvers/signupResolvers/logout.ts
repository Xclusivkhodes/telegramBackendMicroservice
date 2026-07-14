/**
 * signupResolvers/logout.ts — Logout Mutation
 *
 * Full cleanup on logout:
 *   1. Revoke the refresh token in the DB (sets it to null) — this invalidates
 *      the token server-side so it can't be replayed even if stolen.
 *   2. Kill the user's live MTProto connection to free server memory.
 *   3. Clear both auth cookies from the browser.
 *
 * The graphql-shield isAuthenticated rule in permissions.ts ensures this
 * mutation can only be called by a logged-in user.
 */

import { telegramManager } from "../../../lib/telegramManager.js";

export const logout = async (
  _: any,
  __: any,
  { dataSources, user, res }: any,
) => {
  if (user) {
    // Revoke the refresh token so it can't be used to get new access tokens
    await dataSources.users.saveRefreshToken(null, user.id);
    // Disconnect and destroy the pooled Telegram client
    await telegramManager.stopClient(user.id);
  }

  // Clear cookies — sameSite/secure must match the options used when setting them
  res.clearCookie("access_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/refresh",
  });

  return true;
};
