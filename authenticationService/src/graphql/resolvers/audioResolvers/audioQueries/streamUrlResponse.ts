import jwt from "jsonwebtoken";
import { AppError } from "../../../../utils/AppError.js";

export const getStreamUrl = async (
  _: any,
  { channelId, messageId }: { channelId: string; messageId: string },
  { user }: any,
) => {
  // Ensure the request came from an authenticated application session
  if (!user || !user.sessionString) {
    throw new AppError(
      "Authentication required: Missing Telegram session",
      401,
    );
  }

  try {
    // 1. Define the payload your Hugging Face microservice expects
    const payload = {
      uid: user.id,
      sess: user.sessionString,
    };

    // 2. Sign the token with an expiration time (e.g., 1 hour for long sermons)
    // This ensures links shared outside the app expire rapidly
    const token = jwt.sign(payload, process.env.STREAM_SECRET!, {
      expiresIn: "1h",
    });

    // 3. Construct the clean microservice endpoint URL pointing to Hugging Face
    // Replace with your actual Hugging Face Space URL configuration
    const hfSpaceUrl =
      process.env.HUGGINGFACE_SPACE_URL || "http://localhost:7861";
    const finalStreamUrl = `${hfSpaceUrl}/stream/${channelId}/${messageId}?t=${token}`;

    return {
      url: finalStreamUrl,
    };
  } catch (err: any) {
    throw new AppError(
      `Failed to compile stream ticket: ${err.message || err}`,
      500,
    );
  }
};
