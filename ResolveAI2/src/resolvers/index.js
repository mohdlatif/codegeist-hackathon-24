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
    // console.log("Cloudflare token verification response:", data);
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
resolver.define("vectorizePages", async () => {
  try {
    console.log("Starting vectorization process...");

    const accountId = await storage.get("cloudflare_account_id");
    const apiKey = await storage.get("cloudflare_api_key");
    const email = await storage.get("cloudflare_email");

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

    // Upsert vectors to Cloudflare
    const client = new Cloudflare({
      apiEmail: email,
      apiToken: apiKey,
    });

    // Convert vectors to NDJSON format
    const ndjsonVectors = vectors
      .map((vector) => JSON.stringify(vector))
      .join("\n");

    console.log("Upserting vectors:", vectors.length);

    const updateResult = await client.vectorize.indexes.upsert(INDEX_NAME, {
      account_id: accountId,
      body: ndjsonVectors,
    });

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
});

/* --------------------- Vector Testing ---------------------  */
resolver.define("testVectorQuery", async ({ payload }) => {
  try {
    const { query } = payload;
    if (!query) {
      return { success: false, message: "Query is required" };
    }

    // Get Cloudflare credentials
    const accountId = await storage.get("cloudflare_account_id");
    const apiKey = await storage.get("cloudflare_api_key");
    const email = await storage.get("cloudflare_email");

    if (!accountId || !apiKey || !email) {
      return {
        success: false,
        message: "Cloudflare credentials not found",
      };
    }

    const client = new Cloudflare({
      apiEmail: email,
      apiToken: apiKey,
    });

    // Get embeddings from Cloudflare Workers AI
    const embeddingResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: [query],
        }),
      }
    );

    const embeddingData = await embeddingResponse.json();
    console.log("Embedding response:", embeddingData);

    if (!embeddingData.success || !embeddingData.result) {
      return {
        success: false,
        message: "Failed to generate embedding",
        error: embeddingData.errors,
      };
    }

    const queryEmbedding = embeddingData.result.data[0];

    // Search vectors using the embedding
    const searchResponse = await client.vectorize.indexes.query(INDEX_NAME, {
      account_id: accountId,
      vector: queryEmbedding,
      topK: 3,
    });

    console.log("Search response:", searchResponse);

    if (!searchResponse.success) {
      return {
        success: false,
        message: "Failed to query vector database",
        error: searchResponse.errors,
      };
    }

    // If we don't have metadata, fetch the pages directly
    const matches = await Promise.all(
      searchResponse.matches.map(async (match) => {
        try {
          const response = await api
            .asUser()
            .requestConfluence(route`/wiki/api/v2/pages/${match.id}`, {
              headers: {
                Accept: "application/json",
              },
            });
          const pageData = await response.json();

          return {
            title: pageData.title,
            content:
              pageData.body?.storage?.value?.substring(0, 1000) ||
              "No content available",
            score: match.score,
            pageId: match.id,
          };
        } catch (error) {
          console.error(`Error fetching page ${match.id}:`, error);
          return {
            title: "Page not found",
            content: "Error loading page content",
            score: match.score,
            pageId: match.id,
          };
        }
      })
    );

    return {
      success: true,
      matches,
      message: `Found ${matches.length} relevant matches`,
    };
  } catch (error) {
    console.error("Vector query error:", error);
    return {
      success: false,
      message: `Query failed: ${error.message}`,
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
