import api, { route, storage } from "@forge/api";

export const userResolvers = {
  getUsers: async () => {
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
      const filteredUsers = users.filter(
        (user) => user.accountType === "atlassian" && user.active === true
      );
      return filteredUsers;
    } catch (error) {
      console.error("Error fetching users:", error);
      return { error: error.message || "Failed to fetch users" };
    }
  },

  saveSelectedUser: async ({ payload }) => {
    try {
      const { user } = payload;
      await storage.set("selectedUser", user.id);
      return { success: true };
    } catch (error) {
      console.error("Error saving selected user:", error);
      return { error: error.message || "Failed to save selected user" };
    }
  },

  getSelectedUser: async () => {
    try {
      const userId = await storage.get("selectedUser");
      return userId;
    } catch (error) {
      console.error("Error fetching selected user:", error);
      return { error: error.message || "Failed to fetch selected user" };
    }
  },
};
