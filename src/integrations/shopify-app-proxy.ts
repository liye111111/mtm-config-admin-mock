import { env } from "cloudflare:workers";
import { AppError } from "@/src/shared/errors";

const encoder = new TextEncoder();
const isLocal = (request: Request) => ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
const validShop = (shop: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
function constantTimeEqual(left: string, right: string) { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }

export type StorefrontIdentity = { shopId: string; customerId: string | null };

export async function authenticateStorefrontIdentity(request: Request): Promise<StorefrontIdentity> {
  const url = new URL(request.url);
  if (isLocal(request) && request.headers.get("X-MTM-Mock-Shopify") === "1") {
    const shopId = (request.headers.get("X-MTM-Mock-Shop") || env.SHOPIFY_STORE)?.toLowerCase();
    if (!shopId || !validShop(shopId)) throw new AppError("SHOPIFY_STORE 配置无效", 503);
    return { shopId, customerId: request.headers.get("X-MTM-Mock-Customer")?.trim() || null };
  }
  if (!env.SHOPIFY_CLIENT_SECRET) throw new AppError("Shopify App Proxy 密钥未配置", 503);
  const signature = url.searchParams.get("signature") || "", shop = (url.searchParams.get("shop") || "").toLowerCase(), timestamp = Number(url.searchParams.get("timestamp"));
  if (!signature || !validShop(shop) || !Number.isFinite(timestamp)) throw new AppError("App Proxy 请求参数无效", 401);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) throw new AppError("App Proxy 请求已过期", 401);
  const grouped = new Map<string, string[]>();
  for (const [key, value] of url.searchParams) if (key !== "signature") grouped.set(key, [...(grouped.get(key) || []), value]);
  const message = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => `${key}=${values.sort().join(",")}`).join("");
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.SHOPIFY_CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!constantTimeEqual(digest, signature.toLowerCase())) throw new AppError("App Proxy 签名无效", 401);
  return { shopId: shop, customerId: url.searchParams.get("logged_in_customer_id")?.trim() || null };
}

export async function authenticateStorefront(request: Request) { return (await authenticateStorefrontIdentity(request)).shopId; }
