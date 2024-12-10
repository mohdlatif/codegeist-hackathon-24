import { fetch } from "@forge/api";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";

export async function inspectVectorIndex() {
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
}
