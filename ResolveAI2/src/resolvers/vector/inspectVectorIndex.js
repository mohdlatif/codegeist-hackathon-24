import api from "@forge/api";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";

export async function inspectVectorIndex() {
  try {
    const { accountId, apiKey, email } = await getCloudflareCredentials();

    // ... rest of the inspectVectorIndex function ...
  } catch (error) {
    console.error("Error inspecting index:", error);
    return {
      success: false,
      message: `Failed to inspect index: ${error.message}`,
      error: error.toString(),
      stack: error.stack,
    };
  }
}
