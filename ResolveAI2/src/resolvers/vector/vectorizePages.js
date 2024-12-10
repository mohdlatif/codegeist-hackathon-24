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
    console.log("Pages retrieved:", pages?.length || 0, "pages");

    // Get embeddings for all pages using Cloudflare Workers AI
    const vectors = await Promise.all(
      pages.map(async (page) => {
        const contentToEmbed = `${page.title} ${page.body}`;

        const embeddingResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: [contentToEmbed] }),
          }
        );

        const { result } = await embeddingResponse.json();

        return {
          id: page.id.toString(),
          values: result.data[0], // Use the first (and only) embedding
          metadata: {
            title: page.title,
            content: page.body.substring(0, 1000),
            last_updated: new Date().toISOString(),
            page_id: page.id.toString(),
          },
        };
      })
    );

    // Convert vectors to NDJSON format
    const ndjsonVectors = vectors
      .map((vector) => JSON.stringify(vector))
      .join("\n");

    console.log("Upserting vectors:", vectors.length);

    // Use v2 API endpoint directly
    const upsertResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/upsert`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/x-ndjson",
        },
        body: ndjsonVectors,
      }
    );

    if (!upsertResponse.ok) {
      const errorText = await upsertResponse.text();
      console.error("Vector upsert error:", errorText);
      throw new Error(
        `Failed to upsert vectors: ${upsertResponse.status} ${errorText}`
      );
    }

    const updateResult = await upsertResponse.json();
    console.log("Upsert result:", updateResult);

    return {
      success: true,
      message: `Successfully vectorized ${vectors.length} pages`,
      vectorized_count: vectors.length,
      status: "success",
    };
  } catch (error) {
    console.error("Vectorization error:", error);
    return {
      success: false,
      message: `Vectorization failed: ${error.message}`,
      status: "error",
    };
  }
}
