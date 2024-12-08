import Resolver from "@forge/resolver";
import api, { route, storage } from "@forge/api";
import validator from "validator";

const resolver = new Resolver();

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
    // console.log("Pages:", pages);
    return pages;
  } catch (error) {
    console.error("Error fetching pages:", error);
    throw error;
  }
});

resolver.define("saveSelectedPages", async ({ payload }) => {
  try {
    const { pageIds } = payload;
    await storage.set("selectedPages", pageIds);
    return true;
  } catch (error) {
    console.error("Error saving pages:", error);
    throw error;
  }
});

resolver.define("getSavedPages", async () => {
  try {
    const pageIds = (await storage.get("selectedPages")) || [];
    if (pageIds.length === 0) return [];

    // Fetch details for saved pages
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
    throw error;
  }
});

resolver.define("getSelectedPages", async () => {
  try {
    const pageIds = (await storage.get("selectedPages")) || [];
    return pageIds;
  } catch (error) {
    console.error("Error fetching selected pages:", error);
    throw error;
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
    throw error;
  }
});

resolver.define("saveSelectedUser", async ({ payload }) => {
  try {
    const { user } = payload;
    // Store just the user ID
    await storage.set("selectedUser", user.id);
    return true;
  } catch (error) {
    console.error("Error saving selected user:", error);
    throw error;
  }
});

resolver.define("getSelectedUser", async () => {
  try {
    const userId = await storage.get("selectedUser");
    // console.log("Retrieved user ID from storage:", userId);
    return userId;
  } catch (error) {
    console.error("Error fetching selected user:", error);
    throw error;
  }
});

/* --------------------- Cloudflare ---------------------  */
resolver.define("saveCloudflareCredentials", async ({ payload }) => {
  try {
    const { accountId, email, apiKey } = payload;
    await storage.set("cloudflare_account_id", accountId);
    await storage.set("cloudflare_email", email);
    await storage.set("cloudflare_api_key", apiKey);
    return true;
  } catch (error) {
    console.error("Error saving Cloudflare credentials:", error);
    throw error;
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
    throw error;
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
          console.log("Raw page data:", JSON.stringify(pageData, null, 2));

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
    throw error;
  }
});

export const handler = resolver.getDefinitions();
