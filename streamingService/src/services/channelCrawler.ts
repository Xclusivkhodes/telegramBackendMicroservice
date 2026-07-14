/**
 * services/channelCrawler.ts — Telegram Channel Sync Service
 *
 * Called by the 3 AM cron job in server.ts (and optionally via the testAudios
 * GraphQL query during development).
 *
 * For each channel address it:
 *   1. Iterates every audio message using Telegram's InputMessagesFilterMusic
 *   2. Skips messages already in MongoDB (deduplication by messageId + channelId)
 *   3. Downloads the thumbnail (if present) and uploads it to Cloudinary
 *   4. Extracts title, performer, duration, size, mimeType, dcId from the
 *      Telegram Document attributes
 *   5. Bulk-upserts records into MongoDB in batches of 10
 *
 * Concurrency is controlled by p-limit (max 5 simultaneous Cloudinary uploads)
 * to avoid hitting Cloudinary's rate limits or exhausting memory.
 *
 * The dcId saved here is the "secret sauce" for low-latency streaming:
 * knowing which Telegram data centre holds the file lets iterDownload connect
 * directly to the right DC instead of being redirected.
 */

import { Api } from "telegram";
import { telegramManager } from "../lib/telegramManager.js";
import { Audio } from "../models/Audio.js";
import { uploadToCloudinary } from "../utils/cloudinaryUtil.js";
import pLimit from "p-limit";
import { AppError } from "../utils/AppError.js";

// At most 5 Cloudinary uploads run in parallel to stay within rate limits
const limit = pLimit(5);

export const syncChannels = async (
  channelAddresses: string[],
  sessionString?: string,
) => {
  // Use the system admin client (keyed by "SYSTEM_ADMIN") which uses the
  // TG_STRING_SESSION from .env — not a user's personal session.
  const tgClient = await telegramManager.getClient(
    "SYSTEM_ADMIN",
    sessionString || process.env.TG_STRING_SESSION!,
  );

  for (const address of channelAddresses) {
    console.log(`\n--- 🔄 Starting Sync for: ${address} ---`);

    try {
      const entity = await tgClient.getEntity(address);
      const channelId = entity.id.toString();

      let count = 0;
      let batch: any[] = [];

      // iterMessages with InputMessagesFilterMusic yields only audio messages,
      // walking backwards from the newest message to the oldest.
      for await (const message of tgClient.iterMessages(entity, {
        filter: new Api.InputMessagesFilterMusic(),
      })) {
        // Skip non-document messages (e.g. voice notes without a file)
        if (!(message.media instanceof Api.MessageMediaDocument)) continue;

        const doc = message.media.document as Api.Document;

        // ── DEDUPLICATION ────────────────────────────────────────────────────
        // If this exact message version is already in the DB, skip all the
        // expensive thumbnail + metadata work.
        const exists = await Audio.exists({ messageId: message.id, channelId });
        if (exists) continue;

        // ── PROCESS TASK (runs inside p-limit concurrency pool) ──────────────
        const processTask = limit(async () => {
          // Default thumbnail: the project's branded cover image on Cloudinary
          let imageUrl =
            "https://res.cloudinary.com/dtlvw4cfh/image/upload/v1774637964/The_Matyrs_sggjko.jpg";

          // Download the highest-quality thumbnail if the document has one,
          // then re-upload it to Cloudinary for CDN delivery.
          if (doc.thumbs && doc.thumbs.length > 0) {
            try {
              const thumbBuffer = (await tgClient.downloadMedia(message, {
                thumb: doc.thumbs.length - 1, // Last thumb = highest resolution
              })) as Buffer;
              imageUrl = await uploadToCloudinary(thumbBuffer);
            } catch (e: any) {
              console.error(
                "⚠️ Thumb download failed, using default.",
                e.message || e,
              );
              throw new AppError(`An error occured: ${e.mesage || e}`);
            }
          }

          // Extract audio-specific attributes (title, performer, duration)
          const audioAttr = doc.attributes.find(
            (a) => a instanceof Api.DocumentAttributeAudio,
          ) as Api.DocumentAttributeAudio;

          // Extract the original filename as a fallback title source
          const fileAttr = doc.attributes.find(
            (a) => a instanceof Api.DocumentAttributeFilename,
          ) as Api.DocumentAttributeFilename;

          // Title priority: embedded tag → filename → "Unknown Audio"
          // Strip file extension from filename if used as title.
          let rawTitle =
            audioAttr?.title || fileAttr?.fileName || "Unknown Audio";
          const cleanTitle = rawTitle.replace(/\.[^/.]+$/, "").trim();

          // Build a MongoDB bulkWrite operation (upsert = insert or update)
          return {
            updateOne: {
              filter: { messageId: message.id, channelId },
              update: {
                $set: {
                  title: cleanTitle,
                  preacher: audioAttr?.performer || "Unknown Artist",
                  duration: audioAttr?.duration || 0,
                  size: doc.size.toString(),
                  mimeType: doc.mimeType,
                  dcId: doc.dcId,
                  documentId: doc.id.toString(),
                  imageUrl,
                  caption: message.message || "",
                  updatedAt: new Date(),
                },
              },
              upsert: true,
            },
          };
        });

        batch.push(processTask);

        // ── BATCH FLUSH ──────────────────────────────────────────────────────
        // Execute and write every 10 items to keep memory usage flat while
        // still benefiting from MongoDB's bulk-write efficiency.
        if (batch.length >= 10) {
          const results = await Promise.all(batch);
          await Audio.bulkWrite(results);
          count += results.length;
          console.log(`💾 Synced ${count} audios...`);
          batch = [];
        }
      }

      // Flush any remaining items that didn't fill a full batch of 10
      if (batch.length > 0) {
        const results = await Promise.all(batch);
        await Audio.bulkWrite(results);
      }

      console.log(`✅ Successfully synced ${address}`);
    } catch (error: any) {
      console.error(`❌ Failed to sync ${address}:`, error.message);
      throw new AppError(`An error occured: ${error.mesage || error}`);
    }
  }
};
