import { storage,fetch } from "@forge/api";

export const cloudflareResolvers = {
  saveCloudflareCredentials: async ({ payload }) => {
    try {
      const { accountId, email, apiKey } = payload;
      await storage.set("cloudflare_account_id", accountId);
      await storage.set("cloudflare_email", email);
      await storage.set("cloudflare_api_key", apiKey);

      console.log("Cloudflare credentials saved successfully");
      return { success: true };
    } catch (error) {
      console.error("Error saving Cloudflare credentials:", error);
      return {
        error: error.message || "Failed to save Cloudflare credentials",
      };
    }
  },

  getCloudflareCredentials: async () => {
    try {
      const accountId = await storage.get("cloudflare_account_id");
      const email = await storage.get("cloudflare_email");
      const apiKey = await storage.get("cloudflare_api_key");
      return { accountId, email, apiKey };
    } catch (error) {
      console.error("Error fetching Cloudflare credentials:", error);
      return {
        error: error.message || "Failed to fetch Cloudflare credentials",
      };
    }
  },

  verifyCloudflareToken: async ({ payload }) => {
    if (!payload || !payload.apiKey) {
      return { success: false, message: "API Key is required" };
    }

    try {
      const response = await fetch(
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
      return data;
    } catch (error) {
      console.error("Error verifying Cloudflare token:", error);
      return {
        success: false,
        message: error.message || "Failed to verify token",
      };
    }
  },
};
