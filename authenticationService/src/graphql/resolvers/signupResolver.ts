/**
 * graphql/resolvers/signupResolver.ts — User Auth Resolvers
 *
 * Handles all user-facing authentication operations:
 *
 * Queries:
 *   me        — Returns the currently authenticated user (from GraphQL context)
 *   users     — Admin-only: returns all users with sensitive fields stripped
 *               (access enforced by graphql-shield in permissions.ts)
 *
 * Mutations:
 *   registerUser         — Creates a user, issues JWT cookies, and triggers
 *                          Telegram OTP (Step 1 of the login flow)
 *   verifyTelegramLogin  — Completes the OTP flow (Step 2), saves the session
 *                          string, and warms up the MTProto connection
 *   login                — Password auth + JWT cookies + background MTProto warmup
 *   logout               — Clears cookies, revokes refresh token, kills MTProto client
 *
 * Latency optimisations:
 *   • On login: telegramManager.getClient() is called without await so the
 *     MTProto connection starts in the background while the login response is
 *     already on its way to the client.
 *   • On verifyTelegramLogin: the already-connected pending client is handed
 *     directly to TelegramManager, avoiding a second connection round-trip.
 */

import { registerUser } from "./signupResolvers/registerUser.js";
import { verifyTelegramLogin } from "./signupResolvers/verifyTelegramLogin.js";
import { login } from "./signupResolvers/login.js";
import { logout } from "./signupResolvers/logout.js";

export const signupResolver = {
  Query: {
    // Returns the current user from GraphQL context (set by server.ts JWT check)
    me: async (_: any, __: any, { user }: any) => {
      return user;
    },

    // Admin-only: list all users with passwords and tokens stripped
    users: async (_: any, __: any, { dataSources }: any) => {
      const userList = await dataSources.users.findAll();
      return userList.map((user: any) => {
        const u = user.toObject({ virtuals: true });
        // Never expose these fields through the API
        delete u.password;
        delete u.refreshToken;
        delete u.sessionString;
        return u;
      });
    },
  },

  Mutation: {
    /**
     * registerUser — Full registration flow:
     *   1. Check for duplicate email
     *   2. Create user in DB
     *   3. Generate JWT pair and set cookies
     *   4. Trigger Telegram OTP (requestLoginCode)
     *   5. Store phoneCodeHash on the user for Step 2
     */
    registerUser,

    /**
     * verifyTelegramLogin — Step 2 of the OTP flow:
     *   1. Retrieve the live pending client for this user's phone number
     *   2. Call Telegram's auth.SignIn RPC with the OTP code
     *   3. Extract and save the session string
     *   4. Hand the connected client to TelegramManager (warm-up)
     */
    verifyTelegramLogin,

    /**
     * login — Password-based login:
     *   1. Verify email + bcrypt password
     *   2. Generate and set JWT cookies
     *   3. Start MTProto connection in the background (no await)
     */
    login,

    /**
     * logout — Full cleanup:
     *   1. Revoke refresh token in DB
     *   2. Kill the MTProto connection
     *   3. Clear both auth cookies
     */
    logout,
  },
};
