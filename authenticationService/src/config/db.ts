/**
 * config/db.ts — MongoDB Connection
 *
 * Establishes a single Mongoose connection to the Atlas cluster.
 * Called once at startup (in server.ts) before any models are used.
 * Throws an AppError on failure so the process exits with a clear message
 * rather than silently running without a database.
 */

import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";

export const connectDB = async () => {
  try {
    const dbURI = process.env.DATABASE_URI!;
    // mongoose.connect returns the connection object; we don't need it here
    // because Mongoose manages the connection pool internally.
    await mongoose.connect(dbURI);
    console.log(`Database connected`);
  } catch (err: any) {
    console.error("❌ Connection Error:", err.message || err);
    throw new AppError(`An error occured: ${err.mesage || err}`);
  }
};
