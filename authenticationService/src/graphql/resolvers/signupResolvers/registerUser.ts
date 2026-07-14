/**
 * signupResolvers/registerUser.ts — User Registration Mutation
 *
 * Flow:
 *   1. Check for duplicate email — reject with 400 if found
 *   2. Create the user document in MongoDB
 *   3. Generate a JWT access + refresh token pair
 *   4. Save the refresh token to the DB (enables server-side revocation)
 *   5. Trigger Telegram OTP via requestLoginCode (Step 1 of 2-step auth)
 *   6. Set both tokens as httpOnly cookies on the response
 *   7. Store the phoneCodeHash on the user for use in verifyTelegramLogin
 *
 * After this mutation the client must call verifyTelegramLogin with the
 * SMS/app code to complete Telegram authentication and receive a sessionString.
 */

import { User } from "../../../models/User.js";
import { AppError } from "../../../utils/AppError.js";
import { generateToken } from "../../../utils/auth.js";
import { requestLoginCode } from "../../../utils/pendingAuthClients.js";
import { z } from "zod";

export const registerUser = async (
  _: any,
  { input }: any,
  { dataSources, res }: any,
) => {
  const RegisterSchema = z.object({
    email: z.email(),
    phoneNumber: z.string().regex(/^\+\d{7,15}$/),
    password: z.string().min(8).max(128),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    username: z
      .string()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_]+$/),
  });

  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.message, 400);

  const existingUser = await dataSources.users.findUserByEmail(
    parsed.data.email,
  );
  if (existingUser)
    throw new AppError(`User ${parsed.data.email} already exists`, 400);

  const newUser = await dataSources.users.createUser(parsed.data);
  const { refreshToken, accessToken } = generateToken(newUser.id);

  await dataSources.users.saveRefreshToken(refreshToken, newUser.id);

  // Kick off Telegram OTP — user will call verifyTelegramLogin next
  const result = await requestLoginCode(newUser.phoneNumber);
  if (!result.success) throw new AppError(result.message, 500);

  // httpOnly cookies are inaccessible to JavaScript — prevents XSS token theft
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/refresh", // Browser only sends this cookie to /refresh
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000, // Short-lived — rotated via /refresh
  });

  // Store the hash so verifyTelegramLogin can complete the SignIn RPC call
  await User.findByIdAndUpdate(newUser.id, {
    phoneCodeHash: result.phoneCodeHash,
  });

  return newUser;
};
