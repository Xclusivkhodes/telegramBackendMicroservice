/**
 * audioQueries/audio.ts — Search Audio by Title or Preacher
 *
 * Performs a case-insensitive partial-match search across both the title
 * and preacher fields. Used by the frontend search bar.
 *
 * The underlying query uses MongoDB $regex — see AudioDataSources for the
 * regex escaping note to prevent ReDoS on user-supplied input.
 *
 * Returns results sorted ascending by name then sequence.
 */

import { sort } from "fast-sort";
import { AppError } from "../../../../utils/AppError.js";

export const audio = async (_: any, { title }: any, { dataSources }: any) => {
  try {
    const audio = await dataSources.audios.findAudioByTitle(title);
    if (!audio) throw new AppError(`${title} was not found`, 404);

    return sort(audio).asc([
      (audio: any) => audio.name,
      (audio: any) => audio.sequence,
    ]);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`There was an error: ${err.message || err}`);
  }
};
