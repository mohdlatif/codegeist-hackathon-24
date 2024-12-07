import Resolver from "@forge/resolver";
import api, { route, storage } from "@forge/api";

const resolver = new Resolver();

// resolver.define("getText", (req) => {
//   // console.log(req);
//   return "Hello, world!";
// });

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
    const { userId } = payload;
    await storage.set("selectedUser", userId);
    return true;
  } catch (error) {
    console.error("Error saving selected user:", error);
    throw error;
  }
});

resolver.define("getSelectedUser", async () => {
  try {
    const userId = await storage.get("selectedUser");
    return userId;
  } catch (error) {
    console.error("Error fetching selected user:", error);
    throw error;
  }
});

export const handler = resolver.getDefinitions();
