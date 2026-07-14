/**
 * audioMutations/addAudio.ts — Add Audio Mutation
 *
 * Manually inserts a new sermon record into MongoDB.
 * Used for one-off imports when the crawler hasn't picked up a file yet.
 *
 * Access: admin only (enforced by graphql-shield in permissions.ts)
 *
 * Checks for a duplicate title before inserting to prevent accidental
 * double-entries. Throws 400 if the title already exists.
 */

import { AppError } from "../../../../utils/AppError.js";

export const addAudio = async (
  _: any,
  { input }: { input: any },
  { dataSources }: any,
) => {
  try {
    const existingAudio = await dataSources.audios.findAudioByTitle(input.title);
    if (existingAudio) {
      throw new AppError(
        `The audio with the title ${input.title} already exists`,
        400,
      );
    }
    return await dataSources.audios.createAudio(input);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`Failed to add audio: ${err.message || err}`, 400);
  }
};
