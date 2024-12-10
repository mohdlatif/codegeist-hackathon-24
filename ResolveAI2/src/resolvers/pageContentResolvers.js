import api, { route } from "@forge/api";
import { storage } from "@forge/api";

// This file handles retrieving and processing content from saved Confluence pages
// The flow is:
// 1. getSavedPagesContent() is called by the resolver
// 2. Retrieves saved page IDs from storage
// 3. Fetches each page's content using Confluence API
// 4. Processes the Atlas Doc Format content into plain text
// 5. Returns cleaned and formatted page content

// Helper function that recursively extracts plain text from Confluence's Atlas Doc Format
// Atlas Doc Format is a JSON tree structure where text can be nested in various nodes
function extractTextFromAtlasDoc(node) {
  if (typeof node === "string") return node;
  if (!node) return "";
  if (node.type === "text" && node.text) {
    return node.text;
  }
  if (node.content && Array.isArray(node.content)) {
    return node.content
      .map((child) => extractTextFromAtlasDoc(child))
      .join(" ");
  }
  return "";
}

// Sanitizes and normalizes text by:
// - Removing escape characters
// - Stripping control characters
// - Normalizing whitespace
// - Trimming leading/trailing spaces
function cleanText(text) {
  const unescaped = validator.blacklist(text, '\\"\\\\');
  return validator.stripLow(unescaped, true).replace(/\s+/g, " ").trim();
}

// Helper function to get user details
async function getUserDetails(accountId) {
  try {
    const userResponse = await api
      .asUser()
      .requestConfluence(route`/wiki/api/v2/users/${accountId}`, {
        headers: {
          Accept: "application/json",
        },
      });

    const userData = await userResponse.json();
    return {
      accountId: userData.accountId,
      displayName: userData.displayName,
      email: userData.email,
      picture: userData.picture?.path || null,
    };
  } catch (error) {
    console.warn(`Could not fetch user details for ${accountId}:`, error);
    return {
      accountId,
      displayName: "Unknown User",
      email: null,
      picture: null,
    };
  }
}

// Helper function to ensure base URL is set
async function getBaseUrl() {
  let baseUrl = await storage.get("confluence_base_url");
  if (!baseUrl) {
    // Try to get it from the current context
    try {
      const siteResponse = await api
        .asUser()
        .requestConfluence(route`/wiki/api/v2/settings/look-and-feel`, {
          headers: {
            Accept: "application/json",
          },
        });
      const siteData = await siteResponse.json();
      baseUrl = siteData.baseUrl || "";

      // Store it for future use
      await storage.set("confluence_base_url", baseUrl);
    } catch (error) {
      console.warn("Could not determine base URL:", error);
      baseUrl = "";
    }
  }
  return baseUrl;
}

// Main function that:
// 1. Retrieves saved page IDs from storage
// 2. Fetches each page's content from Confluence API
// 3. Processes Atlas Doc Format into plain text
// 4. Handles errors for individual pages without failing the entire request
// Returns: Array of page objects with { id, title, body } or error object
export async function getSavedPagesContent() {
  try {
    // Get stored page IDs
    const pageIds = (await storage.get("tracked_page_ids")) || [];
    console.log("Retrieved page IDs:", pageIds);

    if (!pageIds.length) {
      console.log("No pages found in storage");
      return [];
    }

    // Get base URL once for all pages
    const baseUrl = await getBaseUrl();

    // Fetch detailed content for each page
    const pages = await Promise.all(
      pageIds.map(async (pageId) => {
        try {
          // Get page details
          const pageResponse = await api
            .asUser()
            .requestConfluence(route`/wiki/api/v2/pages/${pageId}`, {
              headers: {
                Accept: "application/json",
              },
            });

          const pageData = await pageResponse.json();

          // Get page body content
          const bodyResponse = await api
            .asUser()
            .requestConfluence(
              route`/wiki/api/v2/pages/${pageId}/body?body-format=storage`,
              {
                headers: {
                  Accept: "application/json",
                },
              }
            );

          const bodyData = await bodyResponse.json();

          // Process the Atlas Doc Format content into plain text
          const processedBody = extractTextFromAtlasDoc(bodyData.value);
          console.log(
            `Processed body content for page ${pageId}, length: ${processedBody.length}`
          );

          // Get space information
          const spaceResponse = await api
            .asUser()
            .requestConfluence(route`/wiki/api/v2/spaces/${pageData.spaceId}`, {
              headers: {
                Accept: "application/json",
              },
            });

          const spaceData = await spaceResponse.json();

          // Get author details
          const author = await getUserDetails(pageData.authorId);

          // Construct the page URL
          const pageUrl = baseUrl
            ? `${baseUrl}/wiki/spaces/${spaceData.key}/pages/${pageId}`
            : `spaces/${spaceData.key}/pages/${pageId}`;

          return {
            id: pageId,
            title: pageData.title || "Untitled",
            body: processedBody,
            spaceKey: spaceData.key,
            spaceId: pageData.spaceId,
            spaceName: spaceData.name,
            author,
            lastModified: pageData.version.when,
            created: pageData.createdAt,
            url: pageUrl,
            version: pageData.version.number,
            status: pageData.status,
            type: pageData.type,
            // Add labels if available
            labels: pageData.labels?.results || [],
          };
        } catch (error) {
          console.error(`Error fetching content for page ${pageId}:`, error);
          // Return a minimal object instead of null for failed fetches
          return {
            id: pageId,
            title: "Error Loading Page",
            body: "",
            error: error.message,
            status: "error",
          };
        }
      })
    );

    // Filter out pages with errors but log them
    const validPages = pages.filter((page) => !page.error);
    const errorPages = pages.filter((page) => page.error);

    if (errorPages.length > 0) {
      console.warn(
        `Failed to fetch ${errorPages.length} pages:`,
        errorPages.map((p) => ({ id: p.id, error: p.error }))
      );
    }

    console.log(`Successfully retrieved ${validPages.length} pages`);

    return validPages;
  } catch (error) {
    console.error("Error getting saved pages content:", error);
    throw error;
  }
}

// GraphQL resolver that wraps getSavedPagesContent
// Adds logging for successful responses
// Used by the frontend to fetch saved pages' content
export const pageContentResolvers = {
  getSavedPagesContent: async () => {
    const result = await getSavedPagesContent();
    if (Array.isArray(result)) {
      console.log("Valid pages content:", JSON.stringify(result, null, 2));
    }
    return result;
  },
};
