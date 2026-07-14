/**
 * models/User.ts — User Mongoose Model
 *
 * Stores registered users and their Telegram session state.
 *
 * Key fields:
 *   sessionString  — The serialised Telegram MTProto session. This is what
 *                    allows the backend to make API calls on behalf of the user
 *                    without re-authenticating. Treat like a password.
 *   phoneCodeHash  — Temporary value stored between Step 1 (requestLoginCode)
 *                    and Step 2 (verifyTelegramLogin). Cleared after use.
 *   refreshToken   — The current valid JWT refresh token. Storing it in the DB
 *                    allows server-side revocation (logout invalidates the token).
 *   role           — "admin" | "preacher" | "user". Admins can mutate audio
 *                    records; regular users can only read and stream.
 *
 * Password hashing:
 *   The pre-save hook hashes the password with bcrypt (salt rounds: 12) before
 *   it ever reaches the database. Plain-text passwords are never stored.
 */

import bcrypt from "bcryptjs";
import { Schema, model } from "mongoose";
import { AppError } from "../utils/AppError.js";
// import { encrypt, decrypt } from "../utils/encryptor.js";

export interface IUser {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  phoneNumber: string;
  refreshToken: string;
  role: string;
  sessionString: string; // Telegram MTProto session — highly sensitive
  phoneCodeHash: string; // Temporary OTP flow state
  isVerified: boolean;
}

// ── Schema Definition ─────────────────────────────────────────────────────────
const userSchema = new Schema<IUser>({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  refreshToken: { type: String },
  sessionString: { type: String },
  phoneCodeHash: { type: String },
  isVerified: { type: Boolean },
  role: {
    type: String,
    enum: ["admin", "preacher", "user"],
    required: true,
    default: "user",
  },
});

// ── Pre-save Hook: Password Hashing ──────────────────────────────────────────
// Runs before every .save() call. Only re-hashes if the password field was
// actually modified (prevents double-hashing on unrelated updates).
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next;

  try {
    // Salt rounds of 12 balances security and hashing speed
    this.password = await bcrypt.hash(this.password, 12);
    return next;
  } catch (err: any) {
    console.log(err);
    throw new AppError(`An error occured: ${err.mesage || err}`);
  }
});

// userSchema.pre("save", function (next) {
//   if (this.isModified("sessionString") && this.sessionString) {
//     this.sessionString = encrypt(this.sessionString);
//   }
//   next;
// });

// // DECRYPT after retrieving from DB
// userSchema.post("init", function (doc) {
//   if (doc.sessionString) {
//     try {
//       doc.sessionString = decrypt(doc.sessionString);
//     } catch (err) {
//       console.error(
//         "Decryption failed. Data might be corrupted or key is wrong.",
//       );
//     }
//   }
// });

export const User = model("User", userSchema);
