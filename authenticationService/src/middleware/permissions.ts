/**
 * middleware/permissions.ts — GraphQL Shield Permission Rules
 *
 * Replaces the old adminOnly() higher-order function with a declarative
 * graphql-shield permission matrix. Rules are defined once here and applied
 * to the entire schema via applyMiddleware() in resolvers.ts.
 *
 * Why graphql-shield over inline guards?
 *   • The full permission matrix is visible in one place.
 *   • Rules are cached per-context (cache: "contextual") so they don't
 *     re-run on every field in a single request.
 *   • Resolvers stay focused on business logic — no auth boilerplate.
 *
 * Rules:
 *   isAuthenticated — user must be present in GraphQL context (valid JWT)
 *   isAdmin         — user must exist AND have role === "admin"
 *
 * fallbackRule: allow — any operation not listed below is public by default.
 * Operations that need protection are listed explicitly.
 */

import { rule, shield, and } from "graphql-shield";
import { AppError } from "../utils/AppError.js";
import { createRateLimitRule } from "graphql-rate-limit";

// createRateLimitRule takes the config (max, window) upfront and returns a
// rule function that only accepts the resolver args — not a second config arg.
const rateLimitRule = (limit: number, window: string) =>
  createRateLimitRule({
    identifyContext: (ctx) => ctx.user?.id || ctx.req.ip,
  })({ max: limit, window });

// Passes if a valid JWT was provided and the user was loaded into context
const isAuthenticated = rule({ cache: "contextual" })(async (
  _parent,
  _args,
  { user },
) => {
  return user ? true : new AppError("Unauthorized", 401);
});

// Passes if the user is authenticated AND has the "admin" role
const isAdmin = rule({ cache: "contextual" })(async (
  _parent,
  _args,
  { user },
) => {
  // FIX: Added optional chaining and a fallback check
  // to prevent crashes if user or role is undefined
  const role = user?.role?.toLowerCase();
  return (
    role === "admin" || new AppError("Forbidden: You are not an admin", 403)
  );
});

export const permissions = shield(
  {
    Query: {
      me: isAuthenticated, // Any logged-in user
      users: and(isAuthenticated, isAdmin), // Admin only
      testAudios: and(isAuthenticated, isAdmin), // Admin only (dev tool)
    },
    Mutation: {
      registerUser: rateLimitRule(5, "15m"), // Public — anyone can register
      login: rateLimitRule(5, "15m"), // Public — anyone can log in
      verifyTelegramLogin: and(isAuthenticated, rateLimitRule(5, "15m")), // Must have a valid JWT from registerUser
      logout: isAuthenticated, // Must be logged in to log out
      addAudio: and(isAuthenticated, isAdmin),
      updateAudio: and(isAuthenticated, isAdmin),
      deleteAudio: and(isAuthenticated, isAdmin),
    },
  },
  {
    // Any operation not listed above is allowed (public audio queries, etc.)
    fallbackRule: rule()(() => true),
    fallbackError: (err: any) =>
      new AppError(`Internal Server Err: ${err.message || err}`, err.code),
  },
);
