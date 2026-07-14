/**
 * audioMutations/deleteAudio.ts — Delete Audio Mutation
 *
 * Permanently removes a sermon record from MongoDB by _id.
 * Access: admin only (enforced by graphql-shield in permissions.ts)
 *
 * Returns the deleted document, or null if the id wasn't found.
 */

export const deleteAudio = async (
  _: any,
  { id }: any,
  { dataSources }: any,
) => {
  return dataSources.audios.deleteAudio(id);
};
