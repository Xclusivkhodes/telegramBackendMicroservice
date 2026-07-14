/**
 * graphql/resolvers/audioResolvers.ts — Audio CRUD & Query Resolvers
 *
 * Mutations (all admin-only via the adminOnly guard):
 *   addAudio    — Manually add a sermon record (used for one-off imports)
 *   updateAudio — Edit an existing sermon's metadata
 *   deleteAudio — Remove a sermon record from the DB
 *
 * Queries:
 *   audios           — All sermons, sorted by name (no pagination)
 *   audio            — Search by title or preacher name (partial match)
 *   audiosByPreacher — Cursor-paginated list filtered by preacher name
 *   getAudios        — Cursor-paginated list of all sermons (newest first)
 *
 * Pagination strategy:
 *   Both paginated queries use cursor-based pagination (not offset/page).
 *   Cursors are base64-encoded MongoDB _id values (or title:_id pairs for
 *   preacher queries). This is stable under inserts/deletes, unlike offset
 *   pagination which can skip or repeat items when the list changes.
 */

import { addAudio } from "./audioResolvers/audioMutations/addAudio.js";
import { updateAudio } from "./audioResolvers/audioMutations/updateAudio.js";
import { deleteAudio } from "./audioResolvers/audioMutations/deleteAudio.js";
import { allAudios } from "./audioResolvers/audioQueries/allAudios.js";
import { audio } from "./audioResolvers/audioQueries/audio.js";
import { audiosByPreacher } from "./audioResolvers/audioQueries/audiosByPreacher.js";
import { getAudios } from "./audioResolvers/audioQueries/getAudios.js";
import { getStreamUrl } from "./audioResolvers/audioQueries/streamUrlResponse.js";

export const audioResolver = {
  Mutation: {
    // Create a new audio record — admin only
    addAudio,

    // Update an existing audio record by ID — admin only
    updateAudio,

    // Delete an audio record by ID — admin only
    deleteAudio,
  },

  Query: {
    // Return all audios sorted by name then sequence (no pagination)
    audios: allAudios,

    // Search audios by title or preacher (partial, case-insensitive match)
    audio,

    // Cursor-paginated sermons filtered by preacher name
    audiosByPreacher,

    // Cursor-paginated list of all sermons (newest first, default 10 per page)
    getAudios,

    // Audio link generator
    getStreamUrl,
  },
};
