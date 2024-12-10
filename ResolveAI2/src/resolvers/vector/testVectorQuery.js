import api from "@forge/api";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";

export async function testVectorQuery({ payload }) {
  try {
    const { query } = payload;
    if (!query) {
      return { success: false, message: "Query is required" };
    }

    // ... rest of the testVectorQuery function ...
  } catch (error) {
    console.error("Vector query error:", error);
    return {
      success: false,
      message: `Query failed: ${error.message}`,
    };
  }
}
