import { fetch } from "@forge/api";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";
import { getSavedPagesContent } from "../pageContentResolvers";

export async function vectorizePages() {
  try {
    console.log("Starting vectorization process...");
    const { accountId, apiKey, email } = await getCloudflareCredentials();

    // Get current pages content
    const pages = await getSavedPagesContent();
    console.log(`Retrieved ${pages.length} pages to vectorize`);
    // console.log("Pages:", pages);

    // Example response from getSavedPagesContent
    // Pages: [
    //     {
    //       id: '361192',
    //       title: 'Power Studio',
    //       body: "body"
    //     }
    //   ]

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
    console.log("Valid vectors:", validVectors);
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
}
