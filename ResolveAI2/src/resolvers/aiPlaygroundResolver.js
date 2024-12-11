import { storage, fetch } from "@forge/api";

export const aiPlaygroundResolver = {
  testAiPlayground: async (payload) => {
    try {
      //   console.log("Received payload:", payload);

      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload received");
      }

      const { payload: { question } = {} } = payload;
      //   console.log("Extracted question:", question);

      if (!question || typeof question !== "string" || !question.trim()) {
        throw new Error("Question is required and must be a non-empty string");
      }

      const apiKey = await storage.get("openai_api_key");
      //   console.log("Processing question:", question);
      const systemPrompt = await storage.get("system_prompt");
      const response = await fetch(
        "https://api.together.xyz/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: "You are a helpful AI assistant focused on providing clear, accurate, and concise responses."
              },
              { role: "user", content: question }
            ],
            model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            max_tokens: 2500,
            temperature: 0.7,
            top_p: 0.7,
            top_k: 50,
            repetition_penalty: 1,
            stop: ["<end_of_turn>", "<eos>"],
          }),
          timeout: 25000,
          size: 102400,
        }
      );

      const jsonResponse = await response.json();
      //   console.log("jsonResponse", jsonResponse);
      if (!jsonResponse.choices || !jsonResponse.choices[0]) {
        throw new Error("Invalid response from AI service");
      }

      const aiContent = jsonResponse.choices[0].message.content;

      return {
        success: true,
        answer: aiContent,
      };
    } catch (error) {
      console.error("AI playground error:", error);
      return {
        success: false,
        error: error.message || "Failed to get AI response",
      };
    }
  },
};
