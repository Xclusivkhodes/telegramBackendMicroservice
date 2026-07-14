import { gql } from "graphql-tag";

export const testTypeDefs = gql`
  type TestAudio {
    title: String!
    preacher: String
    channelId: String!
    messageId: String!
    externalUrl: String
    duration: Int!
    size: Int!
    mimeType: String!
    dcId: ID!
  }

  extend type Query {
    testAudios: [TestAudio!]!
  }
`;
