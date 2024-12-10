import { storage } from "@forge/api";

export const INDEX_NAME = "confluence-pages-index";

export async function getCloudflareCredentials() {
  const accountId = await storage.get("cloudflare_account_id");
  const apiKey = await storage.get("cloudflare_api_key");
  const email = await storage.get("cloudflare_email");

  return { accountId, apiKey, email };
}
