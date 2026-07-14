/**
 * signupResolvers/login.ts — Password Login Mutation
 *
 * Flow:
 *   1. Look up user by email
 *   2. Compare submitted password against the bcrypt hash in the DB
 *   3. Generate a new JWT access + refresh token pair
 *   4. Save the refresh token to the DB
 *   5. Set both tokens as httpOnly cookies
 *   6. Warm up the MTProto connection in the background (no await)
 *
 * The background warm-up (step 6) means the user's Telegram client starts
 * connecting while the login response is already on its way to the browser.
 * By the time the user clicks "Play", the connection is usually ready.
 */

import bcrypt from "bcryptjs";
import { AppError } from "../../../utils/AppError.js";
import { generateToken } from "../../../utils/auth.js";
import { telegramManager } from "../../../lib/telegramManager.js";
import z from "zod";

export const login = async (
  _: any,
  { input }: any,
  { dataSources, res }: any,
) => {
  const LoginSchema = z.object({
    email: z.email(),
    password: z.string().min(8).max(128),
  });

  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.message, 400);

  const user = await dataSources.users.findUserByEmail(parsed.data.email);

  // Use a single generic error for both "user not found" and "wrong password"
  // to prevent user enumeration attacks
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password))) {
    throw new AppError("Invalid credentials", 401);
  }

  const { accessToken, refreshToken } = generateToken(user.id);
  await dataSources.users.saveRefreshToken(refreshToken, user.id);

  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/refresh",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Fire-and-forget: start the MTProto connection without blocking the response
  if (user.sessionString) {
    telegramManager.getClient(user.id, user.sessionString).catch((err) => {
      throw new AppError(`An error occured: ${err.mesage || err}`);
    });
  }

  return user;
};
