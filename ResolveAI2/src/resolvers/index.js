import Resolver from "@forge/resolver";
import api, { route, storage } from "@forge/api";
import validator from "validator";

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
  if (!payload || !payload.apiKey) {
    return { success: false, message: "API Key is required" };
  }

  try {
    const response = await api.fetch(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${payload.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    console.log("Cloudflare token verification response:", data);
    return data;
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
resolver.define("initializeVectorIndex", async () => {
  try {
    const accountId = await storage.get("cloudflare_account_id");
    const apiKey = await storage.get("cloudflare_api_key");

    if (!accountId || !apiKey) {
      return {
        success: false,
        message: "Please save your Cloudflare credentials first",
      };
    }

    // First, check if index exists - Updated URL with v2
    const response = await api.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 404) {
      // Create new index if it doesn't exist - Updated URL with v2
      const createResponse = await api.fetch(
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
              dimensions: 1536,
              metric: "cosine",
            },
          }),
        }
      );

      const createResult = await createResponse.json();
      if (!createResult.success) {
        return {
          success: false,
          message: `Failed to create index: ${createResult.errors?.[0]?.message}`,
        };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error initializing vector index:", error);
    return {
      success: false,
      message: "Failed to initialize vector index. Please try again.",
    };
  }
});

resolver.define("vectorizePages", async () => {
  try {
    console.log("Starting vectorization process...");

    const accountId = await storage.get("cloudflare_account_id");
    const apiKey = await storage.get("cloudflare_api_key");
    console.log("Credentials retrieved:", {
      accountId: !!accountId,
      apiKey: !!apiKey,
    });

    if (!accountId || !apiKey) {
      return {
        success: false,
        message: "Please save your Cloudflare credentials first",
      };
    }

    // Call getSavedPagesContent directly
    console.log("Fetching pages content...");
    const pages = await getSavedPagesContent();
    console.log("Pages retrieved:", pages?.length || 0, "pages");

    if (!pages || pages.length === 0) {
      return {
        success: false,
        message: "No pages found to vectorize",
      };
    }

    // Call initializeVectorIndex directly
    console.log("Initializing vector index...");
    const initResult = await initializeVectorIndex();
    console.log("Index initialization result:", initResult);

    if (!initResult.success) {
      return initResult;
    }

    // Prepare vectors in NDJSON format
    console.log("Preparing vectors...");
    const vectorsNDJSON = pages
      .map((page) => ({
        id: page.id.toString(),
        values: Array(1536)
          .fill(0)
          .map(() => Math.random() * 2 - 1),
        metadata: JSON.stringify({
          title: page.title,
          content: page.body.substring(0, 1000),
          last_updated: new Date().toISOString(),
        }),
      }))
      .map((vector) => JSON.stringify(vector))
      .join("\n");

    console.log("Sample NDJSON line:", vectorsNDJSON.split("\n")[0]);

    // Handle deleted pages
    console.log("Checking for deleted pages...");
    const oldMetadata = await storage.get("vectorization_metadata");
    const oldPageIds = oldMetadata?.page_ids || [];
    const newPageIds = pages.map((p) => p.id);
    const deletedPageIds = oldPageIds.filter((id) => !newPageIds.includes(id));
    console.log("Deleted pages found:", deletedPageIds.length);

    if (deletedPageIds.length > 0) {
      console.log("Deleting old vectors...");
      const deleteResponse = await api.fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/delete_by_ids`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: deletedPageIds.map((id) => id.toString()),
          }),
        }
      );

      if (!deleteResponse.ok) {
        console.error("Delete failed:", await deleteResponse.text());
        return {
          success: false,
          message: "Failed to remove old vectors",
        };
      }
    }

    // Upsert vectors with NDJSON format
    console.log("Upserting vectors to Cloudflare...");
    const upsertResponse = await api.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/upsert`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/x-ndjson", // Changed content type
        },
        body: vectorsNDJSON, // Send NDJSON directly
      }
    );

    console.log("Upsert response status:", upsertResponse.status);
    const responseText = await upsertResponse.text();
    console.log("Upsert response text:", responseText);

    if (!upsertResponse.ok) {
      return {
        success: false,
        message: `Failed to upsert vectors: ${responseText}`,
      };
    }

    // Store metadata
    console.log("Storing vectorization metadata...");
    await storage.set("vectorization_metadata", {
      last_updated: new Date().toISOString(),
      page_count: pages.length,
      page_ids: pages.map((p) => p.id),
    });

    console.log("Vectorization process completed successfully");
    return {
      success: true,
      vectorized_count: pages.length,
      message: `Successfully vectorized ${pages.length} pages`,
    };
  } catch (error) {
    console.error("Vectorization error:", error);
    console.error("Error stack:", error.stack);
    return {
      success: false,
      message: `Failed to vectorize pages: ${error.message}`,
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

async function initializeVectorIndex() {
  try {
    const accountId = await storage.get("cloudflare_account_id");
    const apiKey = await storage.get("cloudflare_api_key");

    if (!accountId || !apiKey) {
      return {
        success: false,
        message: "Please save your Cloudflare credentials first",
      };
    }

    // First, check if index exists
    const response = await api.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 404) {
      const createResponse = await api.fetch(
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
              dimensions: 1536,
              metric: "cosine",
            },
          }),
        }
      );

      const createResult = await createResponse.json();
      if (!createResult.success) {
        return {
          success: false,
          message: `Failed to create index: ${createResult.errors?.[0]?.message}`,
        };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error initializing vector index:", error);
    return {
      success: false,
      message: "Failed to initialize vector index. Please try again.",
    };
  }
}

export const handler = resolver.getDefinitions();
