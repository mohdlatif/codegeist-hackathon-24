import Resolver from "@forge/resolver";
import api, { route, storage } from "@forge/api";

const resolver = new Resolver();

resolver.define("getText", (req) => {
  // console.log(req);
  return "Hello, world!";
});

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
      pageIds.map(async (id) => {
        const response = await api
          .asUser()
          .requestConfluence(route`/wiki/api/v2/pages/${id}`, {
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

export const handler = resolver.getDefinitions();
