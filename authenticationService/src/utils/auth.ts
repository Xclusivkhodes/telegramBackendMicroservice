/**
 * utils/auth.ts — JWT Token Generator
 *
 * Generates a matched pair of access + refresh tokens for a user.
 *
 * Token lifetimes:
 *   accessToken   — 15 minutes. Short-lived to limit exposure if stolen.
 *                   Sent as an httpOnly cookie on every authenticated response.
 *   refreshToken  — 7 days. Used only at POST /refresh to get a new access token.
 *                   Stored in the DB so it can be revoked server-side on logout.
 *
 * Both tokens contain only { userId } in the payload — the minimum needed to
 * identify the user without embedding sensitive data in the token.
 */

import jwt from "jsonwebtoken";

export const generateToken = (userId: string) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
};
