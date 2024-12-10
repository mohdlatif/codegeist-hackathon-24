import api, { route, storage } from "@forge/api";
import validator from "validator";

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

// Main function that:
// 1. Retrieves saved page IDs from storage
// 2. Fetches each page's content from Confluence API
// 3. Processes Atlas Doc Format into plain text
// 4. Handles errors for individual pages without failing the entire request
// Returns: Array of page objects with { id, title, body } or error object
export async function getSavedPagesContent() {
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

          if (!pageData.body?.atlas_doc_format?.value) {
            console.warn(`No body value found for page ${pageId}`);
            return {
              id: pageData.id,
              title: pageData.title,
              body: "",
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

    const validPages = pagesContent.filter((page) => page.body !== undefined);
    return validPages;
  } catch (error) {
    console.error("Error fetching pages content:", error);
    return { error: error.message || "Failed to fetch pages content" };
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
