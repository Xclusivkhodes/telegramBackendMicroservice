/**
 * graphql/dataSources/AudioDataSources.ts — Audio DB Access Layer
 *
 * Thin wrapper around the Audio Mongoose model. All database queries for
 * audio records go through this class, keeping raw Mongoose calls out of
 * resolvers and making the data layer easy to test or swap.
 *
 * Pagination notes:
 *   findPaginated    — Uses _id-based cursor (newest first). Cursor is the
 *                      base64-encoded _id of the last item on the previous page.
 *   findAudioByPreacher — Uses a compound title:_id cursor to handle duplicate
 *                         titles without skipping records.
 *   Both methods fetch limit+1 items to determine hasNextPage without a
 *   separate COUNT query.
 */

import { Audio } from "../../models/Audio.js";
import { AppError } from "../../utils/AppError.js";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class AudioDataSources {
  constructor(private model: typeof Audio) {}

  async findAudioById(id: string) {
    const audio = await this.model.findById(id);
    if (!audio) throw new AppError("Audio not found", 404);
    return audio;
  }

  async createAudio(input: any) {
    return await this.model.create(input);
  }

  /**
   * Search by title OR preacher using a case-insensitive regex.
   * Used by the `audio` GraphQL query for the search feature.
   */
  async findAudioByTitle(title: string) {
    return await this.model.find({
      $or: [
        { title: { $regex: escapeRegex(title), $options: "i" } },
        { preacher: { $regex: escapeRegex(title), $options: "i" } },
      ],
    });
  }

  /**
   * Cursor-paginated query filtered by preacher name.
   *
   * Cursor format: base64("<title>:<_id>")
   * The compound cursor handles the edge case where multiple sermons share
   * the same title — using title alone would skip records.
   */
  async findAudioByPreacher(
    preacher: string,
    first: number = 20,
    after?: string,
  ) {
    let query: any = {
      preacher: { $regex: escapeRegex(preacher), $options: "i" },
    };

    if (after) {
      const [afterTitle, afterId] = Buffer.from(after, "base64")
        .toString("ascii")
        .split(":");

      // Include items where title > afterTitle, OR title == afterTitle AND _id > afterId
      query.$or = [
        { title: { $gt: afterTitle } },
        { title: afterTitle, _id: { $gt: afterId } },
      ];
    }

    // Fetch one extra to check for a next page
    const results = await this.model
      .find(query)
      .sort({ title: 1, _id: 1 }) // Sort must match cursor logic
      .limit(first + 1);

    const hasNextPage = results.length > first;
    const nodes = hasNextPage ? results.slice(0, first) : results;

    const lastItem = nodes[nodes.length - 1];
    const endCursor = lastItem
      ? Buffer.from(`${lastItem.title}:${lastItem._id}`).toString("base64")
      : null;

    return { nodes, pageInfo: { hasNextPage, endCursor } };
  }

  /**
   * Cursor-paginated query for all audios, sorted newest first.
   * Cursor is the base64-encoded _id of the last item on the previous page.
   */
  async findPaginated(first: number, after?: string) {
    const query: any = {};

    if (after) {
      // Items with _id less than the cursor come after it (descending sort)
      const lastId = Buffer.from(after, "base64").toString("ascii");
      query._id = { $lt: lastId };
    }

    return await this.model
      .find(query)
      .sort({ _id: -1 }) // Newest first
      .limit(first + 1); // +1 to detect hasNextPage
  }

  async findAll() {
    return await this.model.find().sort({ title: 1 });
  }

  async updateAudio(id: string, input: any) {
    return await this.model.findByIdAndUpdate(id, input, { new: true });
  }

  async deleteAudio(id: string) {
    return await this.model.findByIdAndDelete(id);
  }
}
