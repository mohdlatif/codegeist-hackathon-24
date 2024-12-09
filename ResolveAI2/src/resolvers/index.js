import Resolver from "@forge/resolver";
import api, { route, storage } from "@forge/api";
import validator from "validator";
import Cloudflare from "cloudflare";

const resolver = new Resolver();

const INDEX_NAME = "confluence-pages-index"; // You might want to make this dynamic based on the user/company

/* --------------------- Pages ---------------------  */
resolver.define("getPages", async () => {
  try {
    const response = await api
      .asUser()
      .requestConfluence(route`/wiki/api/v2/pages`, {
        headers: {
          Accept: "application/json",
        },
      });
    const pages = await response.json();
    return pages;
  } catch (error) {
    console.error("Error fetching pages:", error);
    return { error: error.message || "Failed to fetch pages" };
  }
});

resolver.define("saveSelectedPages", async ({ payload }) => {
  try {
    const { pageIds } = payload;
    await storage.set("selectedPages", pageIds);
    return { success: true };
  } catch (error) {
    console.error("Error saving pages:", error);
    return { error: error.message || "Failed to save pages" };
  }
});

resolver.define("getSavedPages", async () => {
  try {
    const pageIds = (await storage.get("selectedPages")) || [];
    if (pageIds.length === 0) return [];

    const savedPages = await Promise.all(
      pageIds.map(async (pageId) => {
        const response = await api
          .asUser()
          .requestConfluence(route`/wiki/api/v2/pages/${pageId.toString()}`, {
            headers: {
              Accept: "application/json",
            },
          });
        return response.json();
      })
    );
    return savedPages;
  } catch (error) {
    console.error("Error fetching saved pages:", error);
    return { error: error.message || "Failed to fetch saved pages" };
  }
});

resolver.define("getSelectedPages", async () => {
  try {
    const pageIds = (await storage.get("selectedPages")) || [];
    return pageIds;
  } catch (error) {
    console.error("Error fetching selected pages:", error);
    return { error: error.message || "Failed to fetch selected pages" };
  }
});

/* --------------------- Users ---------------------  */
resolver.define("getUsers", async () => {
  try {
    const response = await api
      .asUser()
      .requestJira(
        route`/rest/api/3/users/search?maxResults=100&expand=groups,applicationRoles`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

    const users = await response.json();
    // console.log("Users:", users);
    const filteredUsers = users.filter(
      (user) => user.accountType === "atlassian" && user.active === true
    );
    // console.log("Filtered Users:", filteredUsers);
    return filteredUsers;
  } catch (error) {
    console.error("Error fetching users:", error);
    return { error: error.message || "Failed to fetch users" };
  }
});

resolver.define("saveSelectedUser", async ({ payload }) => {
  try {
    const { user } = payload;
    // Store just the user ID
    await storage.set("selectedUser", user.id);
    return { success: true };
  } catch (error) {
    console.error("Error saving selected user:", error);
    return { error: error.message || "Failed to save selected user" };
  }
});

resolver.define("getSelectedUser", async () => {
  try {
    const userId = await storage.get("selectedUser");
    // console.log("Retrieved user ID from storage:", userId);
    return userId;
  } catch (error) {
    console.error("Error fetching selected user:", error);
    return { error: error.message || "Failed to fetch selected user" };
  }
});

/* --------------------- Cloudflare ---------------------  */
resolver.define("saveCloudflareCredentials", async ({ payload }) => {
  try {
    const { accountId, email, apiKey } = payload;
    await storage.set("cloudflare_account_id", accountId);
    await storage.set("cloudflare_email", email);
    await storage.set("cloudflare_api_key", apiKey);

    console.log("Cloudflare credentials saved successfully");
    // console.log("Account ID:", await storage.get("cloudflare_account_id"));
    // console.log("Email:", await storage.get("cloudflare_email"));
    // console.log("API Key:", await storage.get("cloudflare_api_key"));

    return { success: true };
  } catch (error) {
    console.error("Error saving Cloudflare credentials:", error);
    return { error: error.message || "Failed to save Cloudflare credentials" };
  }
});

resolver.define("getCloudflareCredentials", async () => {
  try {
    const accountId = await storage.get("cloudflare_account_id");
    const email = await storage.get("cloudflare_email");
    const apiKey = await storage.get("cloudflare_api_key");
    return { accountId, email, apiKey };
  } catch (error) {
    console.error("Error fetching Cloudflare credentials:", error);
    return { error: error.message || "Failed to fetch Cloudflare credentials" };
  }
});

resolver.define("verifyCloudflareToken", async ({ payload }) => {
  if (!payload || !payload.apiKey || !payload.accountId) {
    return { success: false, message: "API Key and Account ID are required" };
  }

  try {
    const client = new Cloudflare({
      apiToken: payload.apiKey,
    });

    const response = await client.accounts.tokens.verify({
      account_id: payload.accountId,
    });

    return {
      success: true,
      ...response,
    };
  } catch (error) {
    console.error("Error verifying Cloudflare token:", error);
    return {
      success: false,
      message: error.message || "Failed to verify token",
    };
  }
});

/* --------------------- Pages Content ---------------------  */
// Helper function to extract text from Atlas Doc Format
function extractTextFromAtlasDoc(node) {
  if (typeof node === "string") return node;

  if (!node) return "";

  // Handle text nodes directly
  if (node.type === "text" && node.text) {
    return node.text;
  }

  // Handle content arrays
  if (node.content && Array.isArray(node.content)) {
    return node.content
      .map((child) => extractTextFromAtlasDoc(child))
      .join(" ");
  }

  return "";
}

function cleanText(text) {
  // First remove escaped quotes and backslashes using blacklist
  const unescaped = validator.blacklist(text, '\\"\\\\');

  return validator
    .stripLow(unescaped, true) // Remove control characters but keep newlines
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim(); // Remove leading/trailing whitespace
}

resolver.define("getSavedPagesContent", async () => {
  try {
    const pageIds = (await storage.get("selectedPages")) || [];
    if (pageIds.length === 0) return [];

    const pagesContent = await Promise.all(
      pageIds.map(async (pageId) => {
        try {
          const response = await api
            .asUser()
            .requestConfluence(
              route`/wiki/api/v2/pages/${pageId}?body-format=ATLAS_DOC_FORMAT`,
              {
                headers: {
                  Accept: "application/json",
                },
              }
            );
          const pageData = await response.json();

          // Add debug logging
          // console.log("Raw page data:", JSON.stringify(pageData, null, 2));

          // Check if we have valid body data (updated path)
          if (!pageData.body?.atlas_doc_format?.value) {
            console.warn(`No body value found for page ${pageId}`);
            return {
              id: pageData.id,
              title: pageData.title,
              body: "", // Return empty string if no content
            };
          }

          let bodyContent;
          try {
            bodyContent = JSON.parse(pageData.body.atlas_doc_format.value);
          } catch (parseError) {
            console.error(
              `Error parsing body content for page ${pageId}:`,
              parseError
            );
            return {
              id: pageData.id,
              title: pageData.title,
              body: cleanText(pageData.body.atlas_doc_format.value) || "",
            };
          }

          const plainText = extractTextFromAtlasDoc(bodyContent);
          const cleanedText = cleanText(plainText);

          return {
            id: pageData.id,
            title: pageData.title,
            body: cleanedText,
          };
        } catch (pageError) {
          console.error(`Error processing page ${pageId}:`, pageError);
          return {
            id: pageId,
            title: "Error loading page",
            body: "",
          };
        }
      })
    );

    // Filter out any failed pages
    const validPages = pagesContent.filter((page) => page.body !== undefined);
    console.log("Valid pages content:", JSON.stringify(validPages, null, 2));
    return validPages;
  } catch (error) {
    console.error("Error fetching pages content:", error);
    return { error: error.message || "Failed to fetch pages content" };
  }
});

/* --------------------- Vectorize ---------------------  */
resolver.define("vectorizePages", async () => {
  try {
    console.log("Starting vectorization process...");

    const accountId = await storage.get("cloudflare_account_id");
    const apiKey = await storage.get("cloudflare_api_key");
    const email = await storage.get("cloudflare_email");

    // Validate credentials
    if (!accountId || !apiKey || !email) {
      return {
        success: false,
        message: "Please save your Cloudflare credentials first",
      };
    }

    const client = new Cloudflare({
      apiEmail: email,
      apiToken: apiKey,
    });

    // Get current pages content
    const pages = await getSavedPagesContent();
    console.log("Pages retrieved:", pages?.length || 0, "pages");

    // Get previous vectorization metadata
    const previousMetadata =
      (await storage.get("vectorization_metadata")) || {};
    const previousPageIds = previousMetadata.page_ids || [];
    const previousHashes = previousMetadata.contentHashes || {};

    // Find unselected pages by comparing previous and current page IDs
    const unselectedPageIds = previousPageIds.filter(
      (id) => !pages.some((page) => page.id.toString() === id.toString())
    );

    // If there are unselected pages, delete them from the vector index
    if (unselectedPageIds.length > 0) {
      console.log(
        `Deleting ${unselectedPageIds.length} unselected pages from vector index...`
      );
      try {
        const deleteResponse = await client.vectorize.indexes.deleteByIds(
          INDEX_NAME,
          {
            account_id: accountId,
            ids: unselectedPageIds,
          }
        );

        if (deleteResponse && deleteResponse.success) {
          console.log(
            `Successfully deleted vectors with mutation ID: ${deleteResponse.result?.mutationId}`
          );
        } else {
          console.warn("Vector deletion response:", deleteResponse);
        }
      } catch (deleteError) {
        console.error("Error deleting vectors:", deleteError);
        // Continue with the process even if deletion fails
      }
    }

    // Calculate current content hashes and find pages to update
    const currentHashes = {};
    const pagesToUpdate = [];

    pages.forEach((page) => {
      const contentToHash = `${page.title}|${page.body}`;
      const contentHash = require("crypto")
        .createHash("md5")
        .update(contentToHash)
        .digest("hex");

      currentHashes[page.id] = contentHash;

      // Check if content has changed or if it's a new page
      if (!previousHashes[page.id] || previousHashes[page.id] !== contentHash) {
        pagesToUpdate.push(page);
      }
    });

    // If no changes and no deletions, return early
    if (pagesToUpdate.length === 0 && unselectedPageIds.length === 0) {
      return {
        success: true,
        message: "No content changes detected. Skipping vectorization.",
        vectorized_count: 0,
        removed_count: 0,
        status: "success",
      };
    }

    // Process updates if there are any
    let updateResult = null;
    if (pagesToUpdate.length > 0) {
      // Prepare vectors only for changed content
      const vectors = pagesToUpdate.map((page) => ({
        id: page.id.toString(), // Ensure ID is string for consistency
        values: Array(1536)
          .fill(0)
          .map(() => Math.random() * 2 - 1),
        metadata: {
          title: page.title,
          content: page.body.substring(0, 1000),
          last_updated: new Date().toISOString(),
          page_id: page.id.toString(), // Store Confluence page ID in metadata
        },
      }));

      const ndjsonVectors = vectors
        .map((vector) => JSON.stringify(vector))
        .join("\n");
      updateResult = await client.vectorize.indexes.upsert(INDEX_NAME, {
        account_id: accountId,
        body: ndjsonVectors,
        unparsableBehavior: "error",
      });
    }

    // Update metadata with new state
    await storage.set("vectorization_metadata", {
      last_updated: new Date().toISOString(),
      page_count: pages.length,
      page_ids: pages.map((p) => p.id.toString()), // Ensure IDs are strings
      contentHashes: currentHashes,
      last_mutation_id: updateResult?.result?.mutationId || null,
    });

    // Return comprehensive status
    return {
      success: true,
      message: `Sync complete: ${
        pagesToUpdate.length > 0 ? `${pagesToUpdate.length} pages updated` : ""
      }${
        unselectedPageIds.length > 0
          ? `${pagesToUpdate.length > 0 ? ", " : ""}${
              unselectedPageIds.length
            } pages removed`
          : ""
      }`,
      vectorized_count: pagesToUpdate.length,
      removed_count: unselectedPageIds.length,
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
});

// Extract the functions from their resolver definitions
async function getSavedPagesContent() {
  try {
    const pageIds = (await storage.get("selectedPages")) || [];
    if (pageIds.length === 0) return [];

    const pagesContent = await Promise.all(
      pageIds.map(async (pageId) => {
        try {
          const response = await api
            .asUser()
            .requestConfluence(
              route`/wiki/api/v2/pages/${pageId}?body-format=ATLAS_DOC_FORMAT`,
              {
                headers: {
                  Accept: "application/json",
                },
              }
            );
          const pageData = await response.json();

          // Add debug logging
          // console.log("Raw page data:", JSON.stringify(pageData, null, 2));

          // Check if we have valid body data (updated path)
          if (!pageData.body?.atlas_doc_format?.value) {
            console.warn(`No body value found for page ${pageId}`);
            return {
              id: pageData.id,
              title: pageData.title,
              body: "", // Return empty string if no content
            };
          }

          let bodyContent;
          try {
            bodyContent = JSON.parse(pageData.body.atlas_doc_format.value);
          } catch (parseError) {
            console.error(
              `Error parsing body content for page ${pageId}:`,
              parseError
            );
            return {
              id: pageData.id,
              title: pageData.title,
              body: cleanText(pageData.body.atlas_doc_format.value) || "",
            };
          }

          const plainText = extractTextFromAtlasDoc(bodyContent);
          const cleanedText = cleanText(plainText);

          return {
            id: pageData.id,
            title: pageData.title,
            body: cleanedText,
          };
        } catch (pageError) {
          console.error(`Error processing page ${pageId}:`, pageError);
          return {
            id: pageId,
            title: "Error loading page",
            body: "",
          };
        }
      })
    );

    // Filter out any failed pages
    const validPages = pagesContent.filter((page) => page.body !== undefined);
    // console.log("Valid pages content:", JSON.stringify(validPages, null, 2));
    return validPages;
  } catch (error) {
    console.error("Error fetching pages content:", error);
    return { error: error.message || "Failed to fetch pages content" };
  }
}

export const handler = resolver.getDefinitions();
