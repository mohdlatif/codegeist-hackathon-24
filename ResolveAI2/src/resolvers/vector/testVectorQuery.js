import { fetch } from "@forge/api";
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

    console.log("Starting vector search for query:", query);

    const { accountId, apiKey } = await getCloudflareCredentials();
    console.log("Got credentials:", {
      hasAccountId: !!accountId,
      hasApiKey: !!apiKey,
    });

    // Generate embedding using BGE model
    console.log("Generating embedding...");
    const embeddingResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: [query] }),
      }
    );

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("Embedding generation failed:", {
        status: embeddingResponse.status,
        statusText: embeddingResponse.statusText,
        error: errorText,
      });
      return {
        success: false,
        message: `Failed to generate embedding: ${embeddingResponse.status} ${errorText}`,
      };
    }

    const embeddingData = await embeddingResponse.json();
    console.log("Embedding generated:", {
      success: embeddingData.success,
      hasData: !!embeddingData.result?.data,
      vectorLength: embeddingData.result?.data?.[0]?.length,
    });

    if (!embeddingData.success) {
      console.error("Embedding generation failed:", embeddingData.errors);
      return {
        success: false,
        message: "Failed to generate embedding",
        errors: embeddingData.errors,
      };
    }

    // Query vectors
    console.log("Querying vector index...");
    const searchBody = {
      vector: embeddingData.result.data[0],
      topK: 5,
      return_values: false,
      return_metadata: "all",
      metadata: {},
    };
    console.log("Search request:", {
      index: INDEX_NAME,
      vectorLength: searchBody.vector.length,
      topK: searchBody.topK,
    });

    console.log("Search request body:", JSON.stringify(searchBody, null, 2));

    const searchResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchBody),
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error("Vector search failed:", {
        status: searchResponse.status,
        statusText: searchResponse.statusText,
        error: errorText,
        requestBody: searchBody,
      });
      return {
        success: false,
        message: `Search failed: ${searchResponse.status} ${errorText}`,
        debug: {
          requestBody: searchBody,
          vectorLength: searchBody.vector.length,
        },
      };
    }

    const searchData = await searchResponse.json();
    console.log(
      "Raw search response:",
      JSON.stringify(searchData.result, null, 2)
    );

    // Process results
    const matches = (searchData.result?.matches || [])
      .map((match) => {
        // The match.id contains our page_id since that's how we stored it
        const match_id = match.id;
        console.log("Processing match:", {
          id: match_id,
          score: match.score,
          metadata: match.metadata,
        });

        return {
          title: match.metadata?.title || "Untitled",
          content: match.metadata?.content_preview || "",
          score: Math.round(match.score * 1000) / 1000, // 3 decimal places
          pageId: match_id, // Use the match.id as our pageId
          spaceKey: match.metadata?.space_key,
          author: match.metadata?.author,
          lastUpdated: match.metadata?.last_updated,
          url: match.metadata?.url,
        };
      })
      .filter((match) => {
        const isValid = match.pageId && match.score > 0.5;
        if (!isValid) {
          console.log(`Filtered out match:`, {
            pageId: match.pageId,
            title: match.title,
            score: match.score,
            reason: !match.pageId ? "No pageId" : "Score too low",
          });
        }
        return isValid;
      });

    // Sort matches by score in descending order
    matches.sort((a, b) => b.score - a.score);

    console.log("Search complete:", {
      query: query,
      totalMatches: searchData.result?.matches?.length || 0,
      filteredMatches: matches.length,
      topMatch: matches[0]
        ? {
            title: matches[0].title,
            score: matches[0].score,
            pageId: matches[0].pageId,
          }
        : null,
    });

    return {
      success: true,
      matches,
      message:
        matches.length > 0
          ? `Found ${matches.length} relevant matches with scores above 0.5`
          : "No matches found with sufficient similarity",
      query_text: query,
      total_candidates: searchData.result?.matches?.length || 0,
      debug: {
        embeddingSize: embeddingData.result.data[0].length,
        rawMatchCount: searchData.result?.matches?.length,
        filteredMatchCount: matches.length,
        minScore: Math.min(...(matches.map((m) => m.score) || [0])),
        maxScore: Math.max(...(matches.map((m) => m.score) || [0])),
      },
    };
  } catch (error) {
    console.error("Vector query error:", error);
    return {
      success: false,
      message: `Query failed: ${error.message}`,
      error: error.stack,
    };
  }
}
