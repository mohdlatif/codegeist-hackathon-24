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
      await storage.set("selectedPages", pageIds);
      return { success: true };
    } catch (error) {
      console.error("Error saving pages:", error);
      return { error: error.message || "Failed to save pages" };
    }
  },

  getSavedPages: async () => {
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
  },

  getSelectedPages: async () => {
    try {
      const pageIds = (await storage.get("selectedPages")) || [];
      return pageIds;
    } catch (error) {
      console.error("Error fetching selected pages:", error);
      return { error: error.message || "Failed to fetch selected pages" };
    }
  },
};
