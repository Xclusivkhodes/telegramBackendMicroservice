import { gql } from "graphql-tag";

export const audioTypeDefs = gql`
  input AudioInput {
    title: String!
    preacher: String
    channelId: String!
    messageId: String!
    imageUrl: String
    duration: Int!
    size: Int!
    mimeType: String!
    dcId: ID!
    caption: String!
  }

  type Audio {
    id: ID!
    title: String!
    preacher: String
    channelId: String!
    messageId: String!
    imageUrl: String
    duration: Int!
    size: Int!
    mimeType: String!
    dcId: ID!
    caption: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type AudioConnection {
    edges: [AudioEdge!]!
    pageInfo: PageInfo!
  }

  type AudioEdge {
    cursor: String!
    node: Audio!
  }

  type StreamUrlResponse {
    url: String!
  }

  extend type Query {
    getAudios(first: Int, after: String): AudioConnection!
    audios: [Audio!]!
    audiosByPreacher(
      preacher: String!
      first: Int
      after: String
    ): AudioConnection!
    audio(title: String): [Audio]
    getStreamUrl(channelId: String!, messageId: String!): StreamUrlResponse!
  }

  extend type Mutation {
    addAudio(input: AudioInput): Audio!
    updateAudio(id: ID!, input: AudioInput): Audio!
    deleteAudio(id: ID!): Audio
  }
`;
