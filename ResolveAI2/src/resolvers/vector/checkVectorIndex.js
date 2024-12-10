import Cloudflare from "cloudflare";
import {
  getCloudflareCredentials,
  INDEX_NAME,
} from "../../utils/cloudflareConfig";

export async function checkVectorIndex() {
  try {
    const { accountId, apiKey, email } = await getCloudflareCredentials();

    const client = new Cloudflare({
      apiEmail: email,
      apiToken: apiKey,
    });

    // Get index information
    const indexInfo = await client.vectorize.indexes.get(INDEX_NAME, {
      account_id: accountId,
    });

    console.log("Index information:", indexInfo);
    return indexInfo;
  } catch (error) {
    console.error("Error checking index:", error);
    return {
      success: false,
      message: `Failed to check index: ${error.message}`,
    };
  }
}
