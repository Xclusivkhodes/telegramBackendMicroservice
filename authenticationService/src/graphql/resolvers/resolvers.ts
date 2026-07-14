/**
 * graphql/resolvers/resolvers.ts — Schema Assembly Point
 *
 * This file is the final assembly step for the GraphQL layer:
 *   1. Merges all resolver modules into one object
 *   2. Builds an executable schema (typeDefs + resolvers)
 *   3. Wraps it with vio/graphql-shield permission middleware
 *
 * The exported schemaWithPermissions is passed directly to ApolloServer
 * as its `schema` option — no separate typeDefs/resolvers options needed.
 *
 * To add a new resolver module:
 *   import it and add it to resolverArray below.
 */

import { mergeResolvers } from "@graphql-tools/merge";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { applyMiddleware } from "graphql-middleware";

import { signupResolver } from "./signupResolver.js";
import { audioResolver } from "./audioResolvers.js";
import { typeDefs } from "../schema/schema.js";
import { permissions } from "../../middleware/permissions.js";

// Merge all resolver modules into a single resolver map
const resolverArray = [signupResolver, audioResolver];
const mergedResolvers = mergeResolvers(resolverArray);

// Build a standard executable schema from typeDefs + resolvers
export const schema = makeExecutableSchema({
  typeDefs,
  resolvers: mergedResolvers,
});

// Wrap the schema with vio/graphql-shield so every operation passes through
// the permission rules defined in permissions.ts before reaching a resolver
export const schemaWithPermissions = applyMiddleware(schema, permissions);
