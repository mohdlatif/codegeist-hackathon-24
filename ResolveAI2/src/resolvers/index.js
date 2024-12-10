import Resolver from "@forge/resolver";
import api, { route, storage } from "@forge/api";
import Cloudflare from "cloudflare";
import { pageResolvers } from "./pageResolvers";
import { userResolvers } from "./userResolvers";
import { cloudflareResolvers } from "./cloudflareResolvers";
import {
  pageContentResolvers,
  getSavedPagesContent,
} from "./pageContentResolvers";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../utils/cloudflareConfig";
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
resolver.define("vectorizePages", async () => {
  try {
    console.log("Starting vectorization process...");
    const { accountId, apiKey, email } = await getCloudflareCredentials();

    // Get current pages content
    const pages = await getSavedPagesContent();
    console.log(`Retrieved ${pages.length} pages to vectorize`);

    // Get embeddings for all pages using Cloudflare Workers AI
    const vectors = await Promise.all(
      pages.map(async (page) => {
        try {
          const contentToEmbed = `${page.title}\n\n${page.body}`.trim();
          console.log(
            `Processing page: ${page.title} (${contentToEmbed.length} chars)`
          );

          // Truncate content if too long (Cloudflare has a limit)
          const truncatedContent = contentToEmbed.substring(0, 2048);

          const embeddingResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text: [truncatedContent],
              }),
            }
          );

          if (!embeddingResponse.ok) {
            const errorText = await embeddingResponse.text();
            console.error(
              `Embedding API error for page ${page.id}:`,
              errorText
            );
            return null;
          }

          const embeddingData = await embeddingResponse.json();
          console.log(`Embedding response for page ${page.id}:`, embeddingData);

          if (!embeddingData.success || !embeddingData.result?.data?.[0]) {
            console.error(
              `Failed to generate embedding for page ${page.id}:`,
              embeddingData.errors
            );
            return null;
          }

          return {
            id: page.id.toString(),
            values: embeddingData.result.data[0],
            metadata: {
              title: page.title,
              content: truncatedContent,
              page_id: page.id.toString(),
              last_updated: new Date().toISOString(),
            },
          };
        } catch (error) {
          console.error(`Error processing page ${page.id}:`, error);
          return null;
        }
      })
    );

    // Filter out any failed embeddings
    const validVectors = vectors.filter((v) => v !== null);
    console.log(`Generated ${validVectors.length} valid vectors`);

    if (validVectors.length === 0) {
      return {
        success: false,
        message: "No valid vectors were generated",
      };
    }

    // Convert vectors to NDJSON format (one JSON object per line)
    const ndjsonVectors = validVectors
      .map((vector) => JSON.stringify(vector))
      .join("\n");

    // console.log("NDJSON content:", ndjsonVectors); // Debug log

    // Create a Blob with the NDJSON content
    const blob = new Blob([ndjsonVectors], { type: "application/x-ndjson" });
    const formData = new FormData();
    formData.append("vectors", blob, "vectors.ndjson"); // Changed from 'body' to 'vectors'

    console.log("Upserting vectors to Cloudflare...");

    // Upsert vectors to Cloudflare
    const upsertResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/upsert`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // Note: Don't set Content-Type header when using FormData
        },
        body: formData,
      }
    );

    if (!upsertResponse.ok) {
      const errorText = await upsertResponse.text();
      console.error("Vector upsert error:", errorText);
      return {
        success: false,
        message: `Failed to upsert vectors: ${upsertResponse.status} ${errorText}`,
      };
    }

    const upsertResult = await upsertResponse.json();
    console.log("Vector upsert result:", upsertResult);

    return {
      success: true,
      message: `Successfully vectorized ${validVectors.length} pages`,
      result: upsertResult,
    };
  } catch (error) {
    console.error("Vectorization error:", error);
    return {
      success: false,
      message: `Vectorization failed: ${error.message}`,
    };
  }
});

/* --------------------- Vector Testing ---------------------  */
resolver.define("testVectorQuery", async ({ payload }) => {
  try {
    const { query } = payload;
    if (!query) {
      return { success: false, message: "Query is required" };
    }

    // Get Cloudflare credentials
    const { accountId, apiKey, email } = await getCloudflareCredentials();

    // First, let's check what vectors we have in the index
    console.log("Checking existing vectors before query...");
    const debugResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vector: Array(768).fill(0), // Zero vector to get all vectors
          topK: 100,
          return_metadata: true,
          return_vectors: true,
        }),
      }
    );

    if (debugResponse.ok) {
      const debugData = await debugResponse.json();
      console.log("Current vectors in index:", {
        totalVectors: debugData.result?.matches?.length || 0,
        vectors: debugData.result?.matches?.map((m) => ({
          id: m.id,
          metadata: m.metadata,
          score: m.score,
        })),
      });
    } else {
      console.log("Failed to get current vectors:", await debugResponse.text());
    }

    // Continue with the actual query process
    console.log("Generating embedding for query:", query);
    const embeddingResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: [query],
        }),
      }
    );

    const embeddingData = await embeddingResponse.json();
    console.log("Embedding generated:", {
      success: embeddingData.success,
      vectorSize: embeddingData.result?.data?.[0]?.length,
    });

    if (!embeddingData.success || !embeddingData.result) {
      return {
        success: false,
        message: "Failed to generate embedding",
        error: embeddingData.errors,
      };
    }

    const queryEmbedding = embeddingData.result.data[0];

    // Query the vector index
    console.log("Searching for similar vectors...");
    const searchResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vector: queryEmbedding,
          topK: 3,
          return_metadata: true,
          metadata: {},
        }),
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error("Search response error:", errorText);
      return {
        success: false,
        message: `Search failed: ${searchResponse.status} ${errorText}`,
      };
    }

    const searchData = await searchResponse.json();
    console.log("Search results:", {
      totalMatches: searchData.result?.matches?.length || 0,
      matches: searchData.result?.matches?.map((m) => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata,
      })),
    });

    // If we get matches, fetch the pages
    if (searchData.result?.matches) {
      const matches = await Promise.all(
        searchData.result.matches.map(async (match) => {
          try {
            console.log(`Fetching page details for match: ${match.id}`);
            const response = await api
              .asUser()
              .requestConfluence(route`/wiki/api/v2/pages/${match.id}`, {
                headers: {
                  Accept: "application/json",
                },
              });
            const pageData = await response.json();
            console.log(`Page details retrieved for ${match.id}:`, {
              title: pageData.title,
              hasContent: !!match.metadata?.content,
            });

            return {
              title: pageData.title,
              content: match.metadata?.content || "No content available",
              score: match.score,
              pageId: match.id,
            };
          } catch (error) {
            console.error(`Error fetching page ${match.id}:`, error);
            return {
              title: "Page not found",
              content: "Error loading page content",
              score: match.score,
              pageId: match.id,
            };
          }
        })
      );

      return {
        success: true,
        matches,
        message: `Found ${matches.length} relevant matches`,
      };
    }

    return {
      success: false,
      message: "No matches found",
    };
  } catch (error) {
    console.error("Vector query error:", error);
    return {
      success: false,
      message: `Query failed: ${error.message}`,
    };
  }
});

// Add this new resolver to check index status
resolver.define("checkVectorIndex", async () => {
  try {
    const { accountId, apiKey, email } = await getCloudflareCredentials();

    const client = new Cloudflare({
      apiEmail: email,
      apiToken: apiKey,
    });

    // Get index information
    const indexInfo = await client.vectorize.indexes.get(INDEX_NAME, {
      account_id: accountId,
    });

    console.log("Index information:", indexInfo);
    return indexInfo;
  } catch (error) {
    console.error("Error checking index:", error);
    return {
      success: false,
      message: `Failed to check index: ${error.message}`,
    };
  }
});

// Add this new resolver to inspect vector index contents
resolver.define("inspectVectorIndex", async () => {
  try {
    const { accountId, apiKey, email } = await getCloudflareCredentials();

    console.log("Checking index with credentials:", {
      accountId: accountId ? "present" : "missing",
      apiKey: apiKey ? "present" : "missing",
      email: email ? "present" : "missing",
    });

    // First, get index metadata using v2 endpoint
    const indexResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Index response status:", indexResponse.status);

    if (!indexResponse.ok) {
      const errorText = await indexResponse.text();
      console.error("Index response error:", errorText);
      return {
        success: false,
        message: `Failed to get index: ${indexResponse.status} ${errorText}`,
      };
    }

    const indexData = await indexResponse.json();
    console.log("Index data:", indexData);

    // Query vectors using a simple search with proper format
    const queryBody = {
      vector: Array(768).fill(0), // Zero vector
      topK: 100,
      metadata: {}, // Empty metadata filter
      return_metadata: true, // Changed from returnMetadata
      return_vectors: true, // Changed from returnVectors
    };

    console.log("Query body:", JSON.stringify(queryBody, null, 2));

    const vectorsResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(queryBody),
      }
    );

    console.log("Vectors response status:", vectorsResponse.status);

    if (!vectorsResponse.ok) {
      const errorText = await vectorsResponse.text();
      console.error("Vectors response error:", errorText);
      return {
        success: true,
        message: "Index exists but no vectors found",
        index: indexData.result,
        vectors: {
          count: 0,
          message: "No vectors stored yet",
        },
      };
    }

    const vectorsData = await vectorsResponse.json();
    console.log("Vectors data:", vectorsData);

    // Get stats about the index
    const statsResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/stats`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const statsData = await statsResponse.json();
    console.log("Stats data:", statsData);

    return {
      success: true,
      message: "Index inspection complete",
      index: indexData.result,
      vectors: {
        count: vectorsData.result?.matches?.length || 0,
        sample: vectorsData.result?.matches || [],
        stats: statsData.result,
      },
    };
  } catch (error) {
    console.error("Error inspecting index:", error);
    return {
      success: false,
      message: `Failed to inspect index: ${error.message}`,
      error: error.toString(),
      stack: error.stack,
    };
  }
});

// Add this resolver to create/update the index
resolver.define("initializeVectorIndex", async () => {
  try {
    const { accountId, apiKey, email } = await getCloudflareCredentials();

    // First, check if index exists
    const checkResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const indexExists = checkResponse.ok;
    console.log("Index check response:", await checkResponse.text());

    if (indexExists) {
      return {
        success: true,
        message: "Vector index already exists and is ready to use",
        isExisting: true,
      };
    }

    // If index doesn't exist, create it
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: INDEX_NAME,
          description: "Confluence pages vector index",
          config: {
            dimensions: 768,
            metric: "cosine",
            index_type: "FLAT",
            metadata_fields: [
              {
                name: "title",
                type: "text",
              },
              {
                name: "content",
                type: "text",
              },
              {
                name: "page_id",
                type: "text",
              },
              {
                name: "last_updated",
                type: "text",
              },
            ],
          },
        }),
      }
    );

    const result = await response.json();
    console.log("Index initialization result:", result);

    if (!result.success) {
      return {
        success: false,
        message: `Failed to initialize index: ${
          result.errors?.[0]?.message || "Unknown error"
        }`,
        errors: result.errors,
      };
    }

    return {
      success: true,
      message: "Vector index initialized successfully",
      result,
      isNew: true,
    };
  } catch (error) {
    console.error("Error initializing index:", error);
    return {
      success: false,
      message: `Failed to initialize index: ${error.message}`,
    };
  }
});

export const handler = resolver.getDefinitions();
