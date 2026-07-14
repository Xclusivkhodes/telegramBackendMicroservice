/**
 * models/Audio.ts — Audio (Sermon) Mongoose Model
 *
 * Each document represents one audio file discovered in a Telegram channel.
 * The data is populated by the channel crawler (channelCrawler.ts) and read
 * by the GraphQL resolvers and the streaming controller.
 *
 * Key fields for streaming:
 *   channelId  — Telegram channel/supergroup ID (e.g. "-1001140281557")
 *   messageId  — The specific message ID within that channel. Together with
 *                channelId, this uniquely identifies the file on Telegram.
 *   dcId       — Telegram Data Centre ID. Knowing the DC lets iterDownload
 *                connect directly to the right server, cutting latency.
 *   mimeType   — Sent as Content-Type in the streaming response.
 *   size       — Total file size in bytes; used to build Content-Range headers.
 *
 * Indexes on title, channelId, messageId, and caption support the search and
 * pagination queries in AudioDataSources.
 */

import { Schema, model } from "mongoose";

export interface ITest {
  title: string;
  preacher: string;
  channelId: string;
  messageId: number;
  imageUrl: string;
  duration: number;   // Seconds
  size: number;       // Bytes
  mimeType: string;
  dcId: string;       // Telegram Data Centre ID (critical for streaming performance)
  caption: string;    // Original message text from Telegram
}

const audioSchema = new Schema<ITest>({
  title: {
    type:  String,
    required: true,
    index: true,  // Supports title-based search queries
  },
  preacher: {
    type:     String,
    required: true,
  },
  channelId: {
    type:  String,
    index: true,  // Supports channel-scoped queries
  },
  messageId: {
    type:  Number,
    index: true,  // Supports deduplication checks in the crawler
  },
  imageUrl: {
    type: String, // Cloudinary CDN URL for the sermon thumbnail
  },
  duration: {
    type:     Number,
    required: true,
  },
  size: {
    type:     Number,
    required: true,
  },
  mimeType: {
    type:     String,
    required: true,
  },
  dcId: {
    type:     String,
    required: true,
  },
  caption: {
    type:  String,
    index: true,  // Supports full-text-style caption search
  },
});

export const Audio = model("Audio", audioSchema);
