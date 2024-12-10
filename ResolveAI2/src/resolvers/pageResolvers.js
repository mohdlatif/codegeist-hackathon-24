/**
 * Page-related resolvers for Confluence integration
 *
 * This module contains resolver functions for managing Confluence pages:
 * - getPages: Fetches all available Confluence pages
 * - saveSelectedPages: Stores selected page IDs in storage
 * - getSavedPages: Retrieves full page data for previously selected pages
 * - getSelectedPages: Gets the list of selected page IDs from storage
 *
 * Key features:
 * - Uses Forge API for Confluence interactions
 * - Handles error cases gracefully
 * - Provides consistent error response format
 * - Implements storage persistence for selected pages
 *
 * @module pageResolvers
 */

import api, { route, storage } from "@forge/api";

export const pageResolvers = {
  getPages: async () => {
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
  },

  saveSelectedPages: async ({ payload }) => {
    try {
      const { pageIds } = payload;
      console.log("Saving page IDs to storage:", pageIds);

      if (!Array.isArray(pageIds)) {
        console.error("pageIds is not an array:", pageIds);
        return { error: "Invalid pageIds format" };
      }

      if (pageIds.length === 0) {
        console.warn("Attempting to save empty pageIds array");
      }

      await storage.set("tracked_page_ids", pageIds);

      // Verify the save was successful
      const savedIds = await storage.get("tracked_page_ids");
      console.log("Verified saved page IDs:", savedIds);

      return { success: true, savedIds };
    } catch (error) {
      console.error("Error saving pages:", error);
      return { error: error.message || "Failed to save pages" };
    }
  },

  getSavedPages: async () => {
    try {
      const pageIds = (await storage.get("tracked_page_ids")) || [];
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
  },

  getSelectedPages: async () => {
    try {
      const pageIds = (await storage.get("tracked_page_ids")) || [];
      return pageIds;
    } catch (error) {
      console.error("Error fetching selected pages:", error);
      return { error: error.message || "Failed to fetch selected pages" };
    }
  },
};
