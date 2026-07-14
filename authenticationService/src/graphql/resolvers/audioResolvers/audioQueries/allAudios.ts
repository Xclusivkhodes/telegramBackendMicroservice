/**
 * audioQueries/allAudios.ts — All Audios Query (unpaginated)
 *
 * Returns every sermon in the database sorted by name then sequence.
 * No pagination — intended for admin dashboards or small catalogues.
 * For large catalogues use getAudios (cursor-paginated).
 */

import { sort } from "fast-sort";
import { AppError } from "../../../../utils/AppError.js";

export const allAudios = async (_: any, __: any, { dataSources }: any) => {
  try {
    const audios = dataSources.audios.findAll();
    return sort(audios).desc([
      (audio: any) => audio.name,
      (audio: any) => audio.sequence,
    ]);
  } catch (err: any) {
    throw new AppError(`There was an error: ${err.message || err}`);
  }
};
