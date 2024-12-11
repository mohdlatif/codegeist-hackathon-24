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
  return content.length.toString() + "-" + content.slice(0, 50); // Simple hash for demo
}

// Helper to analyze page changes
async function analyzePageChanges(currentPages, previousState) {
  const changes = {
    unchanged: [],
    added: [],
    updated: [],
    deleted: [],
  };

  // Create maps for easier lookup
  const currentPagesMap = new Map(currentPages.map((page) => [page.id, page]));
  const previousPagesMap = new Map(Object.entries(previousState || {}));

  console.log("Analyzing changes:", {
    currentPages: currentPagesMap.size,
    previousPages: previousPagesMap.size,
    currentIds: Array.from(currentPagesMap.keys()),
    previousIds: Array.from(previousPagesMap.keys()),
  });

  // Find unchanged, added, and updated pages
  for (const [pageId, currentPage] of currentPagesMap.entries()) {
    const previousPage = previousPagesMap.get(pageId);
    const currentHash = calculateContentHash(currentPage);

    if (!previousPage) {
      changes.added.push(currentPage);
    } else if (previousPage.contentHash !== currentHash) {
      changes.updated.push(currentPage);
    } else {
      changes.unchanged.push(currentPage);
    }
  }

  // Find deleted pages
  for (const [pageId, previousPage] of previousPagesMap.entries()) {
    if (!currentPagesMap.has(pageId)) {
      changes.deleted.push({ id: pageId, ...previousPage });
    }
  }

  return changes;
}

// Helper to generate a detailed change summary
function generateChangeSummary(changes, vectors, deleteResult) {
  const summary = [];

  if (changes.added.length > 0) {
    summary.push(
      `Added ${changes.added.length} pages: ${changes.added
        .map((p) => p.title)
        .join(", ")}`
    );
  }

  if (changes.updated.length > 0) {
    summary.push(
      `Updated ${changes.updated.length} pages: ${changes.updated
        .map((p) => p.title)
        .join(", ")}`
    );
  }

  if (changes.deleted.length > 0) {
    summary.push(
      `Deleted ${changes.deleted.length} pages: ${changes.deleted
        .map((p) => p.title || p.id)
        .join(", ")}`
    );
  }

  if (changes.unchanged.length > 0) {
    summary.push(`${changes.unchanged.length} pages remained unchanged`);
  }

  return summary.join(". ");
}

export async function vectorizePages() {
  try {
    console.log("Starting vectorization process...");
    let vectorizationResults = {
      added: { success: false, count: 0, pages: [] },
      updated: { success: false, count: 0, pages: [] },
      deleted: { success: false, count: 0, pages: [] },
      unchanged: { count: 0, pages: [] },
      errors: [],
    };

    // Get Cloudflare credentials first
    const { accountId, apiKey } = await getCloudflareCredentials();
    if (!accountId || !apiKey) {
      throw new Error(
        "Missing Cloudflare credentials. Please configure them in settings."
      );
    }

    // Check and initialize index FIRST, before anything else
    console.log("Checking vector index status...");
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

    if (!checkResponse.ok) {
      console.log("Vector index not found. Initializing...");
      const initResult = await initializeVectorIndex();
      if (!initResult.success) {
        throw new Error(
          `Failed to initialize vector index: ${initResult.message}`
        );
      }
      console.log("Vector index initialized successfully");
    }

    // Debug: List all storage keys properly
    const trackedPageIds = await storage.get("tracked_page_ids");
    console.log("Raw tracked_page_ids from storage:", trackedPageIds);

    if (!trackedPageIds) {
      console.warn(
        "No tracked_page_ids found in storage. Have pages been saved properly?"
      );
      // You might want to check other storage keys that might be used
      const alternateKeys = [
        "pages",
        "page_ids",
        "savedPages",
        "saved_pages",
        "tracked_pages",
      ];

      for (const key of alternateKeys) {
        const value = await storage.get(key);
        if (value) {
          console.log(`Found data in alternate key '${key}':`, value);
        }
      }
    }

    // Get current pages content
    const currentPages = await getSavedPagesContent();
    console.log(
      "Retrieved current pages:",
      currentPages.map((p) => ({ id: p.id, title: p.title }))
    );

    // Get previous state from storage
    const previousState = (await storage.get("vectorized_pages_state")) || {};
    console.log("Previous state:", previousState);

    // Analyze changes
    const changes = await analyzePageChanges(currentPages, previousState);
    console.log("Detected changes:", {
      added: changes.added.map((p) => ({ id: p.id, title: p.title })),
      updated: changes.updated.map((p) => ({ id: p.id, title: p.title })),
      deleted: changes.deleted.map((p) => ({ id: p.id, title: p.title })),
      unchanged: changes.unchanged.length,
    });

    // Handle deletions first
    if (changes.deleted.length > 0) {
      // try {
      //   const deleteIds = changes.deleted.map((page) => page.id.toString());
      //   console.log("Deleting vectors for pages:", deleteIds);
      //   const deleteResponse = await fetch(
      //     `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/delete`,
      //     {
      //       method: "POST",
      //       headers: {
      //         Authorization: `Bearer ${apiKey}`,
      //         "Content-Type": "application/json",
      //       },
      //       body: JSON.stringify({ ids: deleteIds }),
      //     }
      //   );
      //   const deleteResult = await deleteResponse.json();
      //   console.log("Delete response:", deleteResult);
      //   if (!deleteResult.success) {
      //     throw new Error(
      //       `Delete operation failed: ${JSON.stringify(deleteResult.errors)}`
      //     );
      //   }
      //   vectorizationResults.deleted = {
      //     success: true,
      //     count: changes.deleted.length,
      //     pages: changes.deleted.map((p) => ({ id: p.id, title: p.title })),
      //   };
      //   // Remove deleted pages from previous state
      //   deleteIds.forEach((id) => delete previousState[id]);
      // } catch (error) {
      //   console.error("Error deleting vectors:", error);
      //   vectorizationResults.errors.push(
      //     `Failed to delete vectors: ${error.message}`
      //   );
      // }
    }

    // Process pages that need vectorization (added + updated)
    const pagesToProcess = [...changes.added, ...changes.updated];
    if (pagesToProcess.length > 0) {
      try {
        const vectors = await Promise.all(
          pagesToProcess.map(async (page) => {
            // Ensure we have content to embed
            if (!page.body) {
              console.warn(
                `Page ${page.id} (${page.title}) has no body content`
              );
            }

            const contentToEmbed = [
              page.title,
              page.body || "",
              `Space: ${page.spaceName || ""}`,
              `Author: ${page.author?.displayName || "Unknown"}`,
              page.labels?.join(" ") || "",
            ]
              .join("\n")
              .trim();

            console.log(`Preparing content for page ${page.id}:`, {
              title: page.title,
              contentLength: contentToEmbed.length,
              hasBody: !!page.body,
              preview: contentToEmbed.substring(0, 100) + "...",
            });

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

            if (!embeddingResponse.ok) {
              const errorText = await embeddingResponse.text();
              console.error(
                `Failed to generate embedding for page ${page.id}:`,
                errorText
              );
              throw new Error(
                `Embedding generation failed: ${embeddingResponse.status} ${errorText}`
              );
            }

            const { result } = await embeddingResponse.json();
            console.log(`Successfully generated embedding for page ${page.id}`);

            // Create vector with complete metadata
            const vector = {
              id: page.id.toString(),
              values: result.data[0],
              metadata: {
                title: page.title,
                page_id: page.id.toString(),
                space_key: page.spaceKey,
                space_name: page.spaceName,
                last_updated: page.lastModified || page.created,
                content_preview: page.body ? page.body.substring(0, 1000) : "",
                content: page.body || "",
                url: page.url,
                author: page.author?.displayName || "Unknown",
                version: page.version,
                status: page.status,
                type: page.type,
                labels: page.labels || [],
                embedding_text: contentToEmbed.substring(0, 2000),
                last_indexed: new Date().toISOString(),
              },
            };

            console.log(`Created vector for page ${page.id} with metadata:`, {
              id: vector.id,
              title: vector.metadata.title,
              contentLength: vector.metadata.content.length,
              hasMetadata: !!vector.metadata,
            });

            console.log(`Detailed vector metadata for page ${page.id}:`, {
              id: vector.id,
              metadata: {
                title: vector.metadata.title,
                pageId: vector.metadata.page_id,
                contentPreviewLength: vector.metadata.content_preview.length,
                fullContentLength: vector.metadata.content.length,
              },
            });

            return vector;
          })
        );

        // Upsert vectors
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
          const errorText = await upsertResponse.text();
          throw new Error(`Upsert failed: ${errorText}`);
        }

        // Update results for added and updated pages
        vectorizationResults.added = {
          success: true,
          count: changes.added.length,
          pages: changes.added.map((p) => ({ id: p.id, title: p.title })),
        };

        vectorizationResults.updated = {
          success: true,
          count: changes.updated.length,
          pages: changes.updated.map((p) => ({ id: p.id, title: p.title })),
        };
      } catch (error) {
        console.error("Error processing vectors:", error);
        vectorizationResults.errors.push(
          `Failed to process vectors: ${error.message}`
        );
      }
    }

    // Update stored state with new content hashes
    const newState = { ...previousState };
    for (const page of currentPages) {
      newState[page.id] = {
        contentHash: calculateContentHash(page),
        title: page.title,
        lastModified: page.lastModified,
        version: page.version,
      };
    }
    await storage.set("vectorized_pages_state", newState);

    // Generate final response
    const hasChanges =
      changes.added.length > 0 ||
      changes.updated.length > 0 ||
      changes.deleted.length > 0;
    const allSuccessful = vectorizationResults.errors.length === 0;

    return {
      success: allSuccessful,
      message: hasChanges
        ? allSuccessful
          ? `Successfully processed all changes: added ${changes.added.length}, updated ${changes.updated.length}, deleted ${changes.deleted.length}, unchanged ${changes.unchanged.length}`
          : `Partially processed changes with errors: ${vectorizationResults.errors.join(
              ", "
            )}`
        : "No changes detected in pages",
      results: vectorizationResults,
      changes: {
        added: changes.added.length,
        updated: changes.updated.length,
        deleted: changes.deleted.length,
        unchanged: changes.unchanged.length,
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
