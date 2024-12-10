import { fetch, storage } from "@forge/api";

import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";
import { getSavedPagesContent } from "../pageContentResolvers";

// Helper to calculate a hash of the page content
function calculateContentHash(page) {
  const content = `${page.title}${page.body}${page.lastModified}`;
  return content.length.toString() + "-" + content.slice(0, 50); // Simple hash for demo
}

// Helper to compare pages with their previous state
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

export async function vectorizePages() {
  try {
    console.log("Starting vectorization process...");

    // Get Cloudflare credentials first
    const { accountId, apiKey } = await getCloudflareCredentials();
    if (!accountId || !apiKey) {
      throw new Error(
        "Missing Cloudflare credentials. Please configure them in settings."
      );
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
      "Current pages full data:",
      JSON.stringify(currentPages, null, 2)
    );

    // Get previous state from storage
    const previousState = (await storage.get("vectorized_pages_state")) || {};
    console.log("Previous vectorization state:", previousState);

    // Analyze changes
    const changes = await analyzePageChanges(currentPages, previousState);
    console.log("Detailed changes:", JSON.stringify(changes, null, 2));

    // If nothing changed, return early
    if (
      changes.added.length === 0 &&
      changes.updated.length === 0 &&
      changes.deleted.length === 0
    ) {
      return {
        success: true,
        message: "No changes detected in pages",
        changes: {
          unchanged: changes.unchanged.length,
          added: 0,
          updated: 0,
          deleted: 0,
        },
      };
    }

    // Process pages that need vectorization (added + updated)
    const pagesToProcess = [...changes.added, ...changes.updated];
    const vectors = await Promise.all(
      pagesToProcess.map(async (page) => {
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
          values: result.data[0],
          metadata: {
            title: page.title,
            page_id: page.id.toString(),
            space_key: page.spaceKey,
            last_updated: page.lastModified,
            content_preview: page.body.substring(0, 1000),
            url: page.url,
            author: page.author?.displayName || "Unknown",
          },
        };
      })
    );

    // Handle deletions if any
    if (changes.deleted.length > 0) {
      // Note: You'll need to implement this endpoint in your Cloudflare setup
      const deleteResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/delete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: changes.deleted.map((page) => page.id.toString()),
          }),
        }
      );

      if (!deleteResponse.ok) {
        console.error("Failed to delete vectors:", await deleteResponse.text());
      }
    }

    // Upsert new and updated vectors
    if (vectors.length > 0) {
      const ndjsonVectors = vectors
        .map((vector) => JSON.stringify(vector))
        .join("\n");

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
        throw new Error(
          `Failed to upsert vectors: ${upsertResponse.status} ${errorText}`
        );
      }
    }

    // Update stored state with new content hashes
    const newState = {};
    for (const page of currentPages) {
      newState[page.id] = {
        contentHash: calculateContentHash(page),
        title: page.title,
        lastModified: page.lastModified,
      };
    }
    await storage.set("vectorized_pages_state", newState);

    return {
      success: true,
      message: "Vectorization completed successfully",
      changes: {
        unchanged: changes.unchanged.length,
        added: changes.added.length,
        updated: changes.updated.length,
        deleted: changes.deleted.length,
      },
      details: {
        added: changes.added.map((p) => ({ id: p.id, title: p.title })),
        updated: changes.updated.map((p) => ({ id: p.id, title: p.title })),
        deleted: changes.deleted.map((p) => ({ id: p.id, title: p.title })),
      },
    };
  } catch (error) {
    console.error("Vectorization error:", error);
    console.error("Error stack:", error.stack);
    return {
      success: false,
      message: `Vectorization failed: ${error.message}`,
      status: "error",
      error: error.toString(),
    };
  }
}
