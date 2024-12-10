import api, { fetch,  route } from "@forge/api";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";

export async function testVectorQuery({ payload }) {
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
          return_vectors: false,
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
        title: m.metadata?.title,
        content_preview: m.metadata?.content_preview,
      })),
    });

    // If we get matches, fetch the pages
    if (searchData.result?.matches) {
      const matches = await Promise.all(
        searchData.result.matches.map(async (match) => {
          try {
            console.log(`Processing match: ${match.id}`, {
              score: match.score,
              metadata: match.metadata,
            });

            // If we have metadata, use it directly
            if (match.metadata?.title) {
              return {
                title: match.metadata.title,
                content:
                  match.metadata.content_preview ||
                  "No content preview available",
                score: match.score,
                pageId: match.id,
                url: match.metadata.url,
                space: match.metadata.space_name,
                lastUpdated: match.metadata.last_updated,
              };
            }

            // Fallback to fetching page details if no metadata
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
            });

            return {
              title: pageData.title,
              content: "Content not available in metadata",
              score: match.score,
              pageId: match.id,
            };
          } catch (error) {
            console.error(`Error processing match ${match.id}:`, error);
            return {
              title: "Error Processing Result",
              content: "Could not load page content",
              score: match.score,
              pageId: match.id,
              error: error.message,
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
}
