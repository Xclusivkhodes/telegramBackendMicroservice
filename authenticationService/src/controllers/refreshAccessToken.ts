/**
 * controllers/refreshAccessToken.ts — JWT Token Rotation
 *
 * Handles POST /refresh
 *
 * Flow:
 *   1. Read the refresh_token cookie
 *   2. Verify its JWT signature and expiry
 *   3. Load the user from DB and compare the stored token (server-side revocation)
 *   4. Generate a new access + refresh token pair (token rotation)
 *   5. Save the new refresh token to the DB (invalidates the old one)
 *   6. Set both tokens as httpOnly cookies
 *
 * Token rotation means each refresh token can only be used once. If a stolen
 * refresh token is used after the legitimate user has already rotated it, the
 * DB comparison will fail and the request is rejected.
 *
 * Cookie settings:
 *   access_token  — 15 min, all paths
 *   refresh_token — 7 days, path=/refresh (browser only sends it to this route)
 */

import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { generateToken } from "../utils/auth.js";
import { UserDataSources } from "../graphql/dataSources/UserDataSource.js";
import type { Request, Response } from "express";

const refreshAccessToken = async (req: Request, res: Response) => {
  const oldToken = req.cookies.refresh_token;

  // No cookie means the user is logged out
  if (!oldToken) return res.status(401).send("Logged Out");

  try {
    // Verify signature and expiry; throws JsonWebTokenError if invalid
    const payload = jwt.verify(
      oldToken,
      process.env.JWT_REFRESH_SECRET!,
    ) as any;

    const user = await User.findById(payload.userId);
    if (!user) throw new AppError(`User not found`, 404);

    // Server-side revocation check: the token in the DB must match the cookie.
    // If they differ, the token was already rotated (possible replay attack).
    const savedToken = user.refreshToken;
    if (savedToken !== oldToken) throw new AppError(`Refresh token revoked`);

    // Generate a fresh pair and rotate the stored refresh token
    const { accessToken, refreshToken } = generateToken(payload.userId);
    const dataSource = new UserDataSources(User);
    await dataSource.saveRefreshToken(refreshToken, payload.userId);

    // Issue new access token cookie (15 min)
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 15 * 60 * 1000,
    });

    // Issue new refresh token cookie (7 days, scoped to /refresh only)
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    console.log("Access token refreshed");
    return res.send({ ok: true });
  } catch (err: any) {
    res
      .status(401)
      .send(`An error occured while refreshing token: ${err.mesage || err}`);
  }
};

export default refreshAccessToken;
