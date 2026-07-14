/**
 * audioQueries/audiosByPreacher.ts — Paginated Sermons by Preacher
 *
 * Returns a cursor-paginated list of sermons filtered by preacher name
 * (case-insensitive partial match).
 *
 * Cursor format: base64("<title>:<_id>")
 * The compound cursor handles duplicate titles without skipping records.
 * See AudioDataSources.findAudioByPreacher for the full cursor logic.
 *
 * Only throws 404 on the first page (no `after` cursor). Subsequent pages
 * can legitimately return empty edges when the list is exhausted.
 */

import { AppError } from "../../../../utils/AppError.js";

export const audiosByPreacher = async (
  _: any,
  { preacher, first, after }: any,
  { dataSources }: any,
) => {
  try {
    const { nodes, pageInfo } = await dataSources.audios.findAudioByPreacher(
      preacher,
      first,
      after,
    );

    if (!nodes || nodes.length === 0) {
      if (!after)
        throw new AppError(`Audios of ${preacher} was not found`, 404);
    }

    return {
      edges: nodes.map((node: any) => ({
        cursor: Buffer.from(`${node.title}:${node._id}`).toString("base64"),
        node,
      })),
      pageInfo,
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`There was an error: ${err.message || err}`);
  }
};
