/**
 * utils/cloudinaryUtil.ts — Cloudinary Upload Helper
 *
 * Wraps Cloudinary's upload_stream in a Promise so it can be used with
 * async/await. Called by the channel crawler to store sermon thumbnails.
 *
 * All thumbnails are placed in the "telegram_audios" folder on Cloudinary,
 * making them easy to manage and bulk-delete if needed.
 *
 * Returns the secure HTTPS URL of the uploaded image, which is then saved
 * to the Audio document's imageUrl field.
 */

import { v2 as cloudinary } from "cloudinary";
import { config } from "dotenv";

config();

// Configure the Cloudinary SDK with credentials from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME!,
  api_key:    process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

/**
 * Uploads a raw image buffer to Cloudinary.
 *
 * @param buffer - The image data (e.g. a thumbnail downloaded from Telegram)
 * @returns      - The secure CDN URL of the uploaded image
 */
export const uploadToCloudinary = (buffer: Buffer): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "telegram_audios" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result?.secure_url || "");
      },
    );
    // End the stream with the buffer data to trigger the upload
    uploadStream.end(buffer);
  });
};
