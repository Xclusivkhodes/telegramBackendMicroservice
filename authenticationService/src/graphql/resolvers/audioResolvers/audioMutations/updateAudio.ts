/**
 * audioMutations/updateAudio.ts — Update Audio Mutation
 *
 * Updates an existing sermon record by MongoDB _id.
 * Access: admin only (enforced by graphql-shield in permissions.ts)
 *
 * Returns the updated document (findByIdAndUpdate with { new: true }).
 */

export const updateAudio = async (
  _: any,
  { id, input }: any,
  { dataSources }: any,
) => {
  return dataSources.audios.updateAudio(id, input);
};
