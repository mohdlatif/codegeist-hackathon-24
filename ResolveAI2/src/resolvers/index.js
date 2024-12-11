import Resolver from "@forge/resolver";
import { pageResolvers } from "./pageResolvers";
import { userResolvers } from "./userResolvers";
import { cloudflareResolvers } from "./cloudflareResolvers";
import { pageContentResolvers } from "./pageContentResolvers";

import { vectorizePages } from "./vector/vectorizePages";
import { testVectorQuery } from "./vector/testVectorQuery";
import { checkVectorIndex } from "./vector/checkVectorIndex";
import { inspectVectorIndex } from "./vector/inspectVectorIndex";
import { initializeVectorIndex } from "./vector/initializeVectorIndex";
import { openAiResolvers } from "./openAiResolvers";

const resolver = new Resolver();

/* --------------------- Pages ---------------------  */
// Register page resolvers
Object.entries(pageResolvers).forEach(([name, handler]) => {
  resolver.define(name, handler);
});

/* --------------------- Users ---------------------  */
// Register user resolvers
Object.entries(userResolvers).forEach(([name, handler]) => {
  resolver.define(name, handler);
});

/* --------------------- Cloudflare ---------------------  */
// Register Cloudflare resolvers
Object.entries(cloudflareResolvers).forEach(([name, handler]) => {
  resolver.define(name, handler);
});

/* --------------------- Pages Content ---------------------  */
// Register page content resolvers
Object.entries(pageContentResolvers).forEach(([name, handler]) => {
  resolver.define(name, handler);
});

/* --------------------- Vectorize ---------------------  */
/* -------------- Sync Pages to Vector DB --------------  */
resolver.define("vectorizePages", vectorizePages);

/* --------------------- Vector Testing ---------------------  */
resolver.define("testVectorQuery", testVectorQuery);

// Add this new resolver to check index status
resolver.define("checkVectorIndex", checkVectorIndex);

// Add this new resolver to inspect vector index contents
resolver.define("inspectVectorIndex", inspectVectorIndex);

// Add this resolver to create/update the index
resolver.define("initializeVectorIndex", initializeVectorIndex);

/* --------------------- OpenAI Settings ---------------------  */
// Register OpenAI resolvers
Object.entries(openAiResolvers).forEach(([name, handler]) => {
  resolver.define(name, handler);
});

export const handler = resolver.getDefinitions();
