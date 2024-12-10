import { fetch, storage } from "@forge/api";

import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";
import { getSavedPagesContent } from "../pageContentResolvers";
import { initializeVectorIndex } from "./initializeVectorIndex";

// Helper to calculate a hash of the page content
function calculateContentHash(page) {
  const content = `${page.title}${page.body}${page.lastModified}${page.version}`;
  return content.length.toString() + "-" + content.slice(0, 50);
}

// Helper to prepare page content for vectorization
function preparePageContent(page) {
  // Combine title and content for better semantic search
  const content = `Title: ${page.title}\n\nContent: ${page.body}`;
  return {
    id: page.id.toString(),
    content,
    metadata: {
      url: page.url,
      title: page.title,
      space: page.spaceName,
      last_updated: page.lastModified,
    },
  };
}

// Helper to check if vector index exists
async function checkVectorIndexExists(accountId, apiKey) {
  try {
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
    return checkResponse.ok;
  } catch (error) {
    console.error("Error checking vector index:", error);
    return false;
  }
}

export async function vectorizePages() {
  try {
    console.log("Starting vectorization process...");

    // Get Cloudflare credentials
    const { accountId, apiKey } = await getCloudflareCredentials();
    if (!accountId || !apiKey) {
      throw new Error(
        "Missing Cloudflare credentials. Please configure them in settings."
      );
    }

    // Check if index exists, initialize only if it doesn't
    const indexExists = await checkVectorIndexExists(accountId, apiKey);
    if (!indexExists) {
      console.log("Vector index not found, initializing...");
      const initResult = await initializeVectorIndex();
      if (!initResult.success) {
        throw new Error(
          `Failed to initialize vector index: ${initResult.message}`
        );
      }
      console.log("Vector index initialization:", initResult.message);
    }

    // Get current pages
    const currentPages = await getSavedPagesContent();
    console.log(`Retrieved ${currentPages.length} pages`);

    // Prepare pages for vectorization
    const pagesToProcess = currentPages.map(preparePageContent);
    console.log(
      "Prepared pages for vectorization:",
      pagesToProcess.map((p) => ({ id: p.id, title: p.metadata.title }))
    );

    // Generate embeddings for all pages
    const vectors = await Promise.all(
      pagesToProcess.map(async (page) => {
        console.log(
          `Generating embedding for page ${page.id} (${page.metadata.title})`
        );

        const embeddingResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: [page.content] }),
          }
        );

        if (!embeddingResponse.ok) {
          throw new Error(
            `Failed to generate embedding: ${await embeddingResponse.text()}`
          );
        }

        const { result } = await embeddingResponse.json();
        console.log(`Successfully generated embedding for page ${page.id}`);

        return {
          id: page.id,
          values: result.data[0],
          metadata: page.metadata,
        };
      })
    );

    // Upsert all vectors
    console.log(`Upserting ${vectors.length} vectors`);
    const upsertResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/upsert`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/x-ndjson",
        },
        body: vectors.map((vector) => JSON.stringify(vector)).join("\n"),
      }
    );

    if (!upsertResponse.ok) {
      throw new Error(
        `Failed to upsert vectors: ${await upsertResponse.text()}`
      );
    }

    console.log("Successfully stored vectors");

    // Update stored state
    const newState = {};
    for (const page of currentPages) {
      newState[page.id] = {
        contentHash: calculateContentHash(page),
        title: page.title,
        lastModified: page.lastModified,
        version: page.version,
      };
    }
    await storage.set("vectorized_pages_state", newState);

    return {
      success: true,
      message: `Successfully vectorized ${vectors.length} pages`,
      details: {
        vectorized: vectors.map((v) => ({
          id: v.id,
          title: v.metadata.title,
        })),
      },
    };
  } catch (error) {
    console.error("Vectorization error:", error);
    return {
      success: false,
      message: `Vectorization failed: ${error.message}`,
      error: error.toString(),
    };
  }
}
