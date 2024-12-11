import { storage } from "@forge/api";

export const openAiResolvers = {
  saveOpenAiSettings: async (args) => {
    try {
      //   console.log("Received args:", args);
      // Extract payload from the nested structure
      const { apiKey, systemPrompt } = args.payload.payload;

      // Store the actual values, not the masked ones
      if (apiKey !== undefined) {
        await storage.set("openai_api_key", apiKey);
      }
      if (systemPrompt !== undefined) {
        await storage.set("openai_system_prompt", systemPrompt);
      }

      console.log("OpenAI settings saved successfully");
      return { success: true };
    } catch (error) {
      console.error("Error saving OpenAI settings:", error);
      return {
        error: error.message || "Failed to save OpenAI settings",
      };
    }
  },

  getOpenAiSettings: async () => {
    try {
      // Get the actual values from storage
      const apiKey = (await storage.get("openai_api_key")) || "";
      const systemPrompt = (await storage.get("openai_system_prompt")) || "";

      // Log masked version for security
      //   console.log("Retrieved OpenAI settings:", {
      //     apiKey: apiKey || "(empty)",
      //     systemPrompt: systemPrompt || "(empty)",
      //   });

      // Return actual values
      return { apiKey, systemPrompt };
    } catch (error) {
      console.error("Error fetching OpenAI settings:", error);
      return {
        error: error.message || "Failed to fetch OpenAI settings",
      };
    }
  },
};
