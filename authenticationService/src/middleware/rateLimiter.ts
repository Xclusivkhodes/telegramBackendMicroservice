/**
 * middleware/rateLimiter.ts — Express Rate Limiter
 *
 * Applies a sliding-window rate limit to protect sensitive endpoints from
 * brute-force and abuse. Currently applied to POST /refresh.
 *
 * Config:
 *   windowMs — 15-minute window
 *   max      — 10 requests per window per IP
 *
 * When the limit is exceeded the client receives:
 *   429 Too Many Requests  { error: "Too many requests, slow down." }
 *
 * standardHeaders: true  — sends RateLimit-* headers (RFC 6585)
 * legacyHeaders: false   — suppresses the older X-RateLimit-* headers
 */

import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute sliding window
  max: 10,                   // Max 10 requests per IP per window
  message: { error: "Too many requests, slow down." },
  standardHeaders: true,     // Return RateLimit headers in the response
  legacyHeaders: false,      // Disable X-RateLimit-* legacy headers
});

export default authLimiter;
