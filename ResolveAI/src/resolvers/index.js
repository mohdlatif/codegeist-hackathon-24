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

export const handler = resolver.getDefinitions();
