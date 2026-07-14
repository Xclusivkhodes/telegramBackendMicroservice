/**
 * graphql/schema/schema.ts — Root GraphQL Schema
 *
 * Merges all type definition modules into a single array that Apollo Server
 * accepts. The baseTypeDefs defines the root Query and Mutation types that
 * all other schemas extend.
 *
 * To add a new domain (e.g. "Playlist"), create a new typeDefs file and
 * add it to the array here.
 */

import { gql } from "graphql-tag";
import { userTypeDefs } from "./userSchema.js";
import { audioTypeDefs } from "./audioShema.js";
import { testTypeDefs } from "./testSchema.js";

// Base types that all other schemas extend
const baseTypeDefs = gql`
  type Query {
    _empty: String
  }
  type Mutation {
    _empty: String
  }
`;

export const typeDefs = [
  baseTypeDefs,
  userTypeDefs,
  audioTypeDefs,
  testTypeDefs,
];
