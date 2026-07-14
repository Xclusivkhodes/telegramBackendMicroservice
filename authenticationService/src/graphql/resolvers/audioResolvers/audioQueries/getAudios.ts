/**
 * audioQueries/getAudios.ts — Paginated All Audios Query
 *
 * Returns a cursor-paginated list of all sermons, sorted newest first.
 * Default page size is 10. Pass `after` (an endCursor from a previous page)
 * to fetch the next page.
 *
 * Cursor format: base64("<_id>")
 * Uses MongoDB's _id descending sort — stable and index-friendly.
 *
 * The "fetch first+1" trick: we request one extra record to determine
 * hasNextPage without a separate COUNT query.
 */

import { AppError } from "../../../../utils/AppError.js";

export const getAudios = async (
  _: any,
  { first = 10, after }: any,
  { dataSources }: any,
) => {
  try {
    // Fetch one extra to detect whether another page exists
    const audios = await dataSources.audios.findPaginated(first, after);

    const hasNextPage = audios.length > first;
    const nodes = hasNextPage ? audios.slice(0, -1) : audios; // Drop the extra item

    const edges = nodes.map((audio: any) => ({
      cursor: Buffer.from(audio._id.toString()).toString("base64"),
      node:   audio,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      },
    };
  } catch (err: any) {
    throw new AppError(`Pagination error: ${err.message}`);
  }
};
