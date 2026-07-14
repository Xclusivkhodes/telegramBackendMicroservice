/**
 * middleware/auth.ts — REST Route Authentication Middleware
 *
 * Used exclusively on the /stream/:channelId/:messageId route.
 *
 * Why not use the GraphQL context auth?
 * The streaming endpoint is a plain REST route, not a GraphQL operation, so it
 * needs its own JWT verification step.
 *
 * Why load the full User document here instead of just the payload?
 * The streamAudio controller needs req.user.sessionString to open the MTProto
 * connection. Loading the user here means streamAudio doesn't need a second
 * DB query, keeping the time-to-first-byte as low as possible.
 */

import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import type { Response, Request } from "express";

export const authenticateRequest = async (
  req: Request,
  res: Response,
  next: any,
) => {
  const token = req.cookies?.access_token;

  // No cookie → reject immediately, don't touch the DB
  if (!token) return res.status(401).send("Unauthorized");

  try {
    // Verify signature and expiry; throws if invalid
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;

    // Load the full user document so downstream handlers have sessionString etc.
    const currentUser = await User.findById(payload.userId);
    if (!currentUser) return res.status(401).send("User not found");

    req.user = currentUser; // Attach to request for use in streamAudio
    next();
  } catch (err) {
    return res.status(401).send("Invalid Token");
  }
};
