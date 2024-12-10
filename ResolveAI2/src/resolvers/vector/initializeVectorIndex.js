import { fetch } from "@forge/api";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";

// Define the metadata properties we want to index
const METADATA_INDEXES = [
  {
    propertyName: "title",
    indexType: "string",
  },
  {
    propertyName: "space_key",
    indexType: "string",
  },
  {
    propertyName: "page_id",
    indexType: "string",
  },
  {
    propertyName: "author",
    indexType: "string",
  },
  {
    propertyName: "last_updated",
    indexType: "string",
  },
];

export async function initializeVectorIndex() {
  try {
    const { accountId, apiKey } = await getCloudflareCredentials();

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
      console.log(
        "Vector index already exists. Proceeding to create metadata indexes..."
      );
    } else {
      // If index doesn't exist, create it with metadata fields
      const createResponse = await fetch(
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
              metadata_fields: METADATA_INDEXES.map(({ propertyName }) => ({
                name: propertyName,
                type: "text",
                description: `Metadata for ${propertyName}`,
              })),
            },
          }),
        }
      );

      const createResult = await createResponse.json();
      console.log("Index creation result:", createResult);

      if (!createResult.success) {
        return {
          success: false,
          message: `Failed to initialize index: ${
            createResult.errors?.[0]?.message || "Unknown error"
          }`,
          errors: createResult.errors,
        };
      }
    }

    // Create metadata indexes
    const metadataResults = [];
    for (const metadata of METADATA_INDEXES) {
      try {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/metadata_index/create`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              indexType: metadata.indexType,
              propertyName: metadata.propertyName,
            }),
          }
        );

        const result = await response.json();
        metadataResults.push({
          propertyName: metadata.propertyName,
          success: result.success,
          mutationId: result.result?.mutationId,
          errors: result.errors,
        });

        console.log(
          `Created metadata index for ${metadata.propertyName}:`,
          result
        );
      } catch (error) {
        console.error(
          `Failed to create metadata index for ${metadata.propertyName}:`,
          error
        );
        metadataResults.push({
          propertyName: metadata.propertyName,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = metadataResults.filter((r) => r.success).length;
    const failureCount = metadataResults.filter((r) => !r.success).length;

    return {
      success: failureCount === 0,
      message: `Vector index initialized with ${successCount} metadata indexes${
        failureCount > 0 ? `, ${failureCount} failed` : ""
      }`,
      metadataResults,
    };
  } catch (error) {
    console.error("Error initializing index:", error);
    return {
      success: false,
      message: `Failed to initialize index: ${error.message}`,
    };
  }
}
