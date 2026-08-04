import { env } from "cloudflare:workers";
import { AppError } from "@/src/shared/errors";

const encoder = new TextEncoder();
const validShop = (shop: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);

export async function authenticateShopifyWebhook(request: Request, rawBody: string) {
  const shopId = (request.headers.get("X-Shopify-Shop-Domain") || "").toLowerCase();
  const webhookId = request.headers.get("X-Shopify-Webhook-Id") || "";
  const topic = request.headers.get("X-Shopify-Topic") || "";
  const localMock = ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname) && request.headers.get("X-MTM-Mock-Shopify") === "1";
  if (!validShop(shopId) || !webhookId) throw new AppError("Webhook 请求头无效", 401);
  if (!localMock) {
    if (!env.SHOPIFY_CLIENT_SECRET) throw new AppError("Shopify Webhook 密钥未配置", 503);
    const signature = request.headers.get("X-Shopify-Hmac-Sha256") || "";
    let supplied: Uint8Array;
    try { supplied = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0)); }
    catch { throw new AppError("Webhook 签名无效", 401); }
    const key = await crypto.subtle.importKey("raw", encoder.encode(env.SHOPIFY_CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, supplied, encoder.encode(rawBody))) throw new AppError("Webhook 签名无效", 401);
  }
  return { shopId, webhookId, topic };
}
