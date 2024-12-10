import { fetch } from "@forge/api";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";

export async function initializeVectorIndex() {
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
}
