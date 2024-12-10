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
      return_metadata: true,
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
    console.log("Search response:", {
      success: searchData.success,
      matchCount: searchData.result?.matches?.length || 0,
      errors: searchData.errors,
      firstMatchScore: searchData.result?.matches?.[0]?.score,
    });

    if (!searchData.success) {
      console.error("Search failed:", {
        errors: searchData.errors,
        result: searchData.result,
        raw: searchData,
      });
      return {
        success: false,
        message: "Search failed",
        error: searchData.errors?.[0]?.message,
        details: searchData.errors,
      };
    }

    // Process results
    const matches = (searchData.result?.matches || [])
      .map(({ metadata, score }) => {
        const match = {
          title: metadata?.title || "Untitled",
          content: metadata?.content_preview || "",
          score: Math.round(score * 1000) / 1000,
          pageId: metadata?.page_id,
          spaceKey: metadata?.space_key,
          author: metadata?.author,
          lastUpdated: metadata?.last_updated,
          url: metadata?.url,
        };
        console.log(`Match found:`, {
          title: match.title,
          score: match.score,
          hasContent: !!match.content,
          pageId: match.pageId,
        });
        return match;
      })
      .filter((match) => {
        const isValid = match.pageId && match.score > 0.5;
        if (!isValid) {
          console.log(`Filtered out match:`, {
            pageId: match.pageId,
            score: match.score,
            reason: !match.pageId ? "No pageId" : "Score too low",
          });
        }
        return isValid;
      });

    console.log("Search complete:", {
      totalMatches: searchData.result?.matches?.length || 0,
      filteredMatches: matches.length,
      topScore: matches[0]?.score,
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
