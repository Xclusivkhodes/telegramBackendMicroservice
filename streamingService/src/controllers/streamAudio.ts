/**
 * controllers/streamAudio.ts — HTTP Audio Streaming Controller
 *
 * Handles GET /stream/:channelId/:messageId
 *
 * This is the most performance-critical file in the project. It:
 *   1. Normalises the channel ID to Telegram's "-100..." supergroup format
 *   2. Fetches (or cache-hits) the Telegram Document metadata for the audio file
 *   3. Auto-joins the channel if the user's client hasn't joined yet
 *   4. Parses the HTTP Range header so browsers can seek/scrub audio
 *   5. Aligns byte offsets to 1 KB boundaries (MTProto requires aligned reads)
 *   6. Streams chunks from Telegram directly to the HTTP response using
 *      iterDownload — no temp files, no full download buffering
 *
 * The LRU metadata cache avoids a Telegram API call on every range request.
 * A single audio play can trigger dozens of range requests (seek, buffer ahead,
 * quality check), so caching the Document object is essential.
 */

import { Api } from "telegram";
import { telegramManager } from "../lib/telegramManager.js";
import bigInt from "big-integer";
import { LRUCache } from "lru-cache";
import { config } from "dotenv";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";

config();

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string | number;
        sessionString: string;
      };
    }
  }
}

/**
 * LRU cache for Telegram Document metadata.
 * Key: "<userId>:<messageId>"  |  Value: Api.Document
 * TTL is set dynamically per entry based on audio duration (see below).
 * Max 500 entries prevents unbounded memory growth.
 */
const metadataCache = new LRUCache<string, Api.Document>({ max: 500 });

export const streamAudio = async (req: Request, res: Response) => {
  let { t: streamToken } = req.query;

  if (!streamToken || typeof streamToken !== "string") {
    return res
      .status(401)
      .json({ error: "Unauthorized: Missing stream token" });
  }

  // 1. VERIFY COMPACT TOKEN (No DB trip required)
  const decoded = jwt.verify(streamToken, process.env.STREAM_SECRET!) as {
    uid: string;
    sess: string;
  };

  const user = {
    id: decoded.uid,
    sessionString: decoded.sess,
  };
  let { channelId, messageId } = req.params;
  // Ensure channelId is a string (Express can type params as string | string[])
  const channelIdStr = Array.isArray(channelId) ? channelId[0] : channelId;

  // ── 1. ID NORMALISATION ──────────────────────────────────────────────────
  // Telegram supergroups/channels use "-100<id>" internally. The frontend may
  // send just the numeric part, so we prepend "-100" if it's missing.
  const fullChannelId = channelIdStr!.startsWith("-100")
    ? channelIdStr
    : `-100${channelIdStr}`;

  const range = req.headers.range;
  const cacheKey = `${user!.id}:${messageId}`;

  if (!user!.sessionString) {
    return res.status(403).json({ error: "Telegram verification required" });
  }

  try {
    // Get (or create) the user's pooled MTProto connection
    const tgClient = await telegramManager.getClient(
      String(user!.id),
      user!.sessionString,
    );

    // ── 2. METADATA FETCH (with LRU cache) ──────────────────────────────────
    // We need the Document object to know file size, mimeType, dcId, etc.
    // Check the cache first to avoid a Telegram API round-trip.
    let doc = metadataCache.get(cacheKey);

    if (!doc) {
      let message;
      try {
        // Fastest path: direct message lookup by ID
        const messages = await tgClient.getMessages(fullChannelId as string, {
          ids: [parseInt(messageId as string)],
        });
        message = messages[0];

        // An empty or media-less message means we likely aren't in the channel
        if (!message || !message.media) throw new Error("ENTITY_MISSING");
      } catch (err: any) {
        // ── AUTO-JOIN LOGIC ────────────────────────────────────────────────
        // If the entity lookup fails (user not in channel), attempt to join
        // the channel automatically, then retry the message fetch.
        if (
          err.message.includes("entity") ||
          err.message.includes("INVALID") ||
          err.message === "ENTITY_MISSING"
        ) {
          console.log(
            `[AUTH] User ${user!.id} needs to join ${fullChannelId}. Joining now...`,
          );

          try {
            // GramJS RPC calls must go through .invoke()
            await tgClient.invoke(
              new Api.channels.JoinChannel({
                channel: "t.me/the_martyrs",
              }),
            );

            // Retry after joining
            const messages = await tgClient.getMessages(
              fullChannelId as string,
              {
                ids: [parseInt(messageId as string)],
              },
            );
            message = messages[0];
          } catch (joinErr: any) {
            console.error("❌ Auto-join failed:", joinErr.message);
            return res.status(403).json({
              error: "Cannot access this channel. It may be private.",
            });
          }
        } else {
          // Not an entity error — re-throw (e.g. flood wait, network error)
          throw err;
        }
      }

      // Validate that the message actually contains an audio document
      if (
        !message?.media ||
        !(message.media instanceof Api.MessageMediaDocument)
      ) {
        return res
          .status(404)
          .json({ error: "Audio not found or unavailable" });
      }

      doc = message.media.document as Api.Document;

      // ── DYNAMIC CACHE TTL ────────────────────────────────────────────────
      // Cache the document for 1.5× the audio duration. A 1-hour sermon stays
      // cached for 90 minutes — long enough to cover the full listening session
      // including seeks, but not so long that stale data accumulates.
      const audioAttr = doc.attributes.find(
        (a) => a instanceof Api.DocumentAttributeAudio,
      ) as Api.DocumentAttributeAudio;

      const durationSeconds = audioAttr?.duration || 3600;
      const dynamicTTL = (durationSeconds + durationSeconds / 2) * 1000;
      metadataCache.set(cacheKey, doc, { ttl: dynamicTTL });
    }

    // ── 3. RANGE PARSING & 1 KB ALIGNMENT ───────────────────────────────────
    // HTTP range requests specify byte offsets (e.g. "bytes=1048576-2097151").
    // MTProto's iterDownload requires offsets aligned to 1024-byte boundaries,
    // so we round down the start and round up the limit, then trim the extra
    // bytes before writing to the response.
    const fileSize = Number(doc.size);
    let start = 0;
    let end = fileSize - 1;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0] as string, 10);
      end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    }

    const alignedStart = Math.floor(start / 1024) * 1024; // Round down to 1 KB
    const bytesToSkip = start - alignedStart; // Bytes to discard from first chunk
    const chunkLength = end - start + 1; // Exact bytes the client wants
    const alignedLimit = Math.ceil((end - alignedStart + 1) / 1024) * 1024; // Round up

    // ── 4. RESPONSE HEADERS ──────────────────────────────────────────────────
    // 206 Partial Content for range requests, 200 for full-file requests.
    // Content-Range tells the browser where this chunk sits in the full file.
    res.writeHead(range ? 206 : 200, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkLength,
      "Content-Type": doc.mimeType,
      "Cache-Control": "no-cache",
    });

    // ── 5. STREAMING ENGINE ──────────────────────────────────────────────────
    // iterDownload is a GramJS async generator that fetches the file in
    // requestSize-byte chunks directly from Telegram's DC (data centre).
    // We pipe each chunk straight to the HTTP response — no disk I/O.
    const iter = tgClient.iterDownload({
      file: new Api.InputDocumentFileLocation({
        id: doc.id,
        accessHash: doc.accessHash,
        fileReference: doc.fileReference,
        thumbSize: "",
      }),
      offset: bigInt(alignedStart),
      limit: alignedLimit,
      dcId: doc.dcId,
      requestSize: 128 * 1024, // 128 KB per Telegram API request
    });

    let bytesSent = 0;
    let isFirstChunk = true;

    console.log(
      `\n[STREAM START] Msg: ${messageId} | Target: ${chunkLength} bytes`,
    );

    for await (let chunk of iter) {
      // Stop if the client disconnected mid-stream
      if (res.writableEnded || res.finished) break;

      // Trim the alignment padding from the very first chunk
      if (isFirstChunk && bytesToSkip > 0) {
        chunk = chunk.subarray(bytesToSkip);
        isFirstChunk = false;
      }

      const remainingNeeded = chunkLength - bytesSent;
      if (remainingNeeded <= 0) break;

      // Trim the last chunk if it overshoots the requested range
      let dataToWrite = chunk;
      if (chunk.length > remainingNeeded) {
        dataToWrite = chunk.subarray(0, remainingNeeded);
      }

      res.write(dataToWrite);
      bytesSent += dataToWrite.length;

      // Live progress indicator in the server console
      const progressMB = (bytesSent / 1024 / 1024).toFixed(2);
      const totalMB = (fileSize / 1024 / 1024).toFixed(2);
      process.stdout.write(
        `\r[Streaming] ${progressMB}MB / ${totalMB}MB | Msg: ${messageId}`,
      );

      // Exit the loop once we've sent exactly what was requested
      if (dataToWrite.length < chunk.length || bytesSent >= chunkLength) {
        process.stdout.write("\n");
        break;
      }
    }

    if (!res.writableEnded) res.end();
    console.log(
      `[STREAM END] Served ${bytesSent} bytes for message ${messageId}\n`,
    );
  } catch (error: any) {
    // A premature close means the user navigated away — not an error worth logging
    if (
      error.code === "ERR_STREAM_PREMATURE_CLOSE" ||
      error.message.includes("closed")
    ) {
      return;
    }

    console.error("❌ Streaming Error:", error.message);

    // Only send an error response if headers haven't been sent yet
    // (once streaming starts, we can't change the status code)
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Streaming failed" });
    }
  }
};
