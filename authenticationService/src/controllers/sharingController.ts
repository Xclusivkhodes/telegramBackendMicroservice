/**
 * controllers/sharingController.ts — Social Share Link Handler
 */
import type { Request, Response } from "express";
import { Audio as AudioModel } from "../models/Audio.js";
import path from "node:path";
import fs from "node:fs/promises"; // Use promises for cleaner async/await

// Helper to prevent XSS and broken HTML attributes
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const shareController = async (req: Request, res: Response) => {
  try {
    const { channelId, messageId } = req.params;

    // Normalise channel ID to Telegram's "-100..." format
    const channelIdStr = Array.isArray(channelId) ? channelId[0] : channelId;
    if (!channelIdStr) {
      return res.status(400).send("Invalid channelId");
    }
    const cleanChannelId = channelIdStr.startsWith("-100")
      ? channelIdStr
      : `-100${channelIdStr}`;

    // Parse messageId to number
    const messageIdNum = parseInt(messageId as string, 10);
    if (isNaN(messageIdNum)) {
      return res.status(400).send("Invalid messageId");
    }

    // 1. Look up sermon metadata.
    // Note: ensure your DB field is 'channelId'
    const audio = await AudioModel.findOne({
      channelId: cleanChannelId,
      messageId: messageIdNum,
    });

    // 2. Build metadata with fallback
    const metadata = {
      title: audio?.title || "Sermon",
      preacher: audio?.preacher || "The Martyrs",
      description:
        audio?.caption || "Listen to this powerful message on The Martyrs.",
      cover: audio?.imageUrl || "https://thematyrs.com/default-share-image.jpg",
      url: `https://thematyrs.com/share/${channelId}/${messageId}`,
    };

    // 3. Read the index.html file
    // Using process.cwd() is often safer than relative dots in compiled TS
    const indexPath = path.resolve(process.cwd(), "public/index.html");
    let htmlData = await fs.readFile(indexPath, "utf8");

    // 4. Inject personalised OG meta tags
    // We escape values going into content attributes to prevent broken tags
    const personalizedHtml = htmlData
      .replace(
        "<title>The Martyrs</title>",
        `<title>${escapeHtml(metadata.title)} - ${escapeHtml(metadata.preacher)}</title>`,
      )
      .replace(/__OG_TITLE__/g, escapeHtml(metadata.title))
      .replace(
        /__OG_DESCRIPTION__/g,
        escapeHtml(`Sermon by ${metadata.preacher}: ${metadata.description}`),
      )
      .replace(/__OG_IMAGE__/g, metadata.cover) // URLs usually don't need escaping unless they have query params
      .replace(/__OG_URL__/g, metadata.url);

    // 5. Return the modified HTML
    return res.status(200).send(personalizedHtml);
  } catch (error) {
    console.error("Sharing Controller Error:", error);
    return res.status(500).send("Server Error");
  }
};
