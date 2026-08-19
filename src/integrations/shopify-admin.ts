import { env } from "cloudflare:workers";
import { AppError } from "@/src/shared/errors";
import type { SaveProductBindingInput } from "@/src/schemas/product";

export type ShopifyProductSnapshot = {
  shopId: string; gid: string; legacyId: string; title: string; handle: string; imageUrl?: string; imageAlt?: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED"; variantCount: number; hasAvailableVariant: boolean; onlineStoreUrl?: string; adminUrl: string; updatedAt?: string;
};

export type ShopifyCustomizationMarker = {
  enabled: boolean;
  templateCode?: string;
  templateVersion?: number;
};

type SessionClaims = { aud?: string; dest?: string; exp?: number; nbf?: number };
type CachedToken = { value: string; expiresAt: number };
let clientCredentialsToken: CachedToken | undefined;
const decodeBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), (character) => character.charCodeAt(0));
const isLocalRequest = (request: Request) => ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);

function configuredShop() {
  const shop = env.SHOPIFY_STORE?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new AppError("SHOPIFY_STORE 配置无效", 503);
  return shop;
}

async function authenticateSessionToken(token: string) {
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) throw new AppError("Shopify 应用凭证尚未配置", 503);
  const parts = token.split(".");
  if (parts.length !== 3) throw new AppError("Shopify Session Token 无效", 401);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SHOPIFY_CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new AppError("Shopify Session Token 签名无效", 401);
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]))) as SessionClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== env.SHOPIFY_CLIENT_ID || !claims.exp || claims.exp < now || (claims.nbf && claims.nbf > now + 5)) throw new AppError("Shopify Session Token 已失效", 401);
  const shop = new URL(claims.dest || "").hostname.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new AppError("Shopify 店铺身份无效", 401);
  return shop;
}

async function clientCredentialsAccessToken(shop: string) {
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) throw new AppError("Shopify 应用凭证尚未配置", 503);
  if (configuredShop() !== shop) throw new AppError("本地 Shopify 店铺与配置不一致", 403);
  if (clientCredentialsToken && clientCredentialsToken.expiresAt > Date.now()) return clientCredentialsToken.value;
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET });
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new AppError(payload.error_description || payload.error || "无法获取 Shopify Admin API Token", 502);
  const lifetime = Math.max(60, payload.expires_in ?? 86_399);
  clientCredentialsToken = { value: payload.access_token, expiresAt: Date.now() + Math.max(30, lifetime - 300) * 1000 };
  return payload.access_token;
}

export async function verifyShopifyVariant(shop: string, productId: string, variantId: string) {
  const token = await clientCredentialsAccessToken(shop);
  const gid = variantId.startsWith("gid://") ? variantId : `gid://shopify/ProductVariant/${variantId}`;
  const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query: `query VariantForCustomization($id: ID!) { productVariant(id: $id) { id legacyResourceId sku availableForSale product { legacyResourceId } } }`, variables: { id: gid } }) });
  const payload = await response.json() as { data?: { productVariant?: { legacyResourceId: string; sku?: string; availableForSale: boolean; product: { legacyResourceId: string } } }; errors?: Array<{ message: string }> };
  if (!response.ok || payload.errors?.length) throw new AppError(payload.errors?.[0]?.message || "Shopify Variant 查询失败", 502);
  const variant = payload.data?.productVariant;
  if (!variant || String(variant.product.legacyResourceId) !== productId) throw new AppError("Variant 不属于当前商品", 422);
  if (!variant.availableForSale) throw new AppError("当前 Variant 不可售", 422);
  return { variantId: String(variant.legacyResourceId), sku: variant.sku || "" };
}

export async function getShopifyProductType(shop: string, productId: string) {
  const token = await accessToken(shop, undefined, true);
  const gid = productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}`;
  const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: `query ProductTypeForSizeRecommendation($id: ID!) { product(id: $id) { productType } }`, variables: { id: gid } }),
  });
  const payload = await response.json() as { data?: { product?: { productType: string } }; errors?: Array<{ message: string }> };
  const error = payload.errors?.[0]?.message;
  if (!response.ok || error) throw new AppError(error || "Shopify 商品分类查询失败", 502);
  if (!payload.data?.product) throw new AppError("Shopify 商品不存在", 404);
  return payload.data.product.productType.trim();
}

async function accessToken(shop: string, sessionToken?: string, allowClientCredentials = false) {
  if (env.SHOPIFY_ADMIN_ACCESS_TOKEN && (!env.SHOPIFY_STORE || env.SHOPIFY_STORE === shop)) return env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (allowClientCredentials && env.SHOPIFY_AUTH_MODE === "client_credentials") return clientCredentialsAccessToken(shop);
  if (!sessionToken) throw new AppError("请从 Shopify Admin 重新打开应用", 401);
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: sessionToken, subject_token_type: "urn:ietf:params:oauth:token-type:id_token", requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
  }) });
  if (!response.ok) throw new AppError("无法建立 Shopify Admin API 会话", 502);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new AppError("Shopify Admin API 未返回访问令牌", 502);
  return payload.access_token;
}

async function mutationContext(request: Request, expectedShop: string) {
  const local = isLocalRequest(request);
  if (local && request.headers.get("X-MTM-Mock-Shopify") === "1") return null;
  const useClientCredentials = local && env.SHOPIFY_AUTH_MODE === "client_credentials";
  const authorization = request.headers.get("Authorization");
  const sessionToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const shop = useClientCredentials ? configuredShop() : await authenticateSessionToken(sessionToken || "");
  if (shop !== expectedShop) throw new AppError("Shopify 店铺身份不匹配", 403);
  return { shop, token: await accessToken(shop, sessionToken, useClientCredentials) };
}

export async function setShopifyCustomizationMarker(request: Request, productGid: string, shop: string, marker: ShopifyCustomizationMarker) {
  const context = await mutationContext(request, shop);
  if (!context) return;
  const response = await fetch(`https://${context.shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": context.token },
    body: JSON.stringify({
      query: `mutation SetCustomizationMarker($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id namespace key type value } userErrors { field message code } } }`,
      variables: { metafields: [{ ownerId: productGid, namespace: "mtm", key: "customization", type: "json", value: JSON.stringify(marker) }] },
    }),
  });
  const payload = await response.json() as { data?: { metafieldsSet?: { userErrors: Array<{ message: string }> } }; errors?: Array<{ message: string }> };
  const error = payload.errors?.[0]?.message || payload.data?.metafieldsSet?.userErrors?.[0]?.message;
  if (!response.ok || error) throw new AppError(error || "Shopify 定制标记写入失败", 502);
}

export async function resolveShopifyProduct(request: Request, input: SaveProductBindingInput): Promise<ShopifyProductSnapshot> {
  const local = isLocalRequest(request);
  const useMock = local && request.headers.get("X-MTM-Mock-Shopify") === "1";
  const useClientCredentials = local && !useMock && env.SHOPIFY_AUTH_MODE === "client_credentials";
  if (useMock && input.mockProduct) {
    const legacyId = input.shopifyProductGid.split("/").at(-1);
    if (!legacyId) throw new AppError("Mock Shopify Product GID 无效");
    return { shopId: "local-dev.myshopify.com", gid: input.shopifyProductGid, legacyId, title: input.mockProduct.title, handle: input.mockProduct.handle,
      imageUrl: input.mockProduct.imageUrl, imageAlt: input.mockProduct.imageAlt, status: input.mockProduct.status, variantCount: input.mockProduct.variantCount,
      hasAvailableVariant: input.mockProduct.variantCount > 0, onlineStoreUrl: input.mockProduct.onlineStoreUrl, adminUrl: `https://admin.shopify.com/store/local-dev/products/${legacyId}`, updatedAt: input.mockProduct.updatedAt };
  }
  const authorization = request.headers.get("Authorization");
  const sessionToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const shop = useClientCredentials ? configuredShop() : await authenticateSessionToken(sessionToken || "");
  const token = await accessToken(shop, sessionToken, useClientCredentials);
  const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({
    query: `query ProductForBinding($id: ID!) { product(id: $id) { id legacyResourceId title handle status updatedAt onlineStoreUrl featuredMedia { preview { image { url altText } } } variantsCount { count } variants(first: 10) { nodes { availableForSale } } } }`,
    variables: { id: input.shopifyProductGid },
  }) });
  if (!response.ok) throw new AppError("Shopify 商品查询失败", 502);
  const payload = await response.json() as { data?: { product?: { id: string; legacyResourceId: string; title: string; handle: string; status: "ACTIVE" | "DRAFT" | "ARCHIVED"; updatedAt: string; onlineStoreUrl?: string; featuredMedia?: { preview?: { image?: { url: string; altText?: string } } }; variantsCount: { count: number }; variants: { nodes: Array<{ availableForSale: boolean }> } } }; errors?: Array<{ message: string }> };
  if (payload.errors?.length) throw new AppError(payload.errors[0].message, 502);
  const product = payload.data?.product;
  if (!product) throw new AppError("Shopify 商品不存在", 404);
  return { shopId: shop, gid: product.id, legacyId: String(product.legacyResourceId), title: product.title, handle: product.handle,
    imageUrl: product.featuredMedia?.preview?.image?.url, imageAlt: product.featuredMedia?.preview?.image?.altText, status: product.status,
    variantCount: product.variantsCount.count, hasAvailableVariant: product.variants.nodes.some((variant) => variant.availableForSale), onlineStoreUrl: product.onlineStoreUrl,
    adminUrl: `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/products/${product.legacyResourceId}`, updatedAt: product.updatedAt };
}

export async function authenticateAdminList(request: Request) {
  if (isLocalRequest(request) && request.headers.get("X-MTM-Mock-Shopify") === "1") return "local-dev.myshopify.com";
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new AppError("请从 Shopify Admin 重新打开应用", 401);
  return authenticateSessionToken(authorization.slice(7));
}

export async function getShopifyProductTypes(request: Request, search = "") {
  const local = isLocalRequest(request);
  const useMock = local && request.headers.get("X-MTM-Mock-Shopify") === "1";
  if (useMock) return ["西服外套", "西裤", "背心"].filter((value) => value.includes(search.trim()));
  const useClientCredentials = local && env.SHOPIFY_AUTH_MODE === "client_credentials";
  const authorization = request.headers.get("Authorization");
  const sessionToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const shop = useClientCredentials ? configuredShop() : await authenticateSessionToken(sessionToken || "");
  const token = await accessToken(shop, sessionToken, useClientCredentials);
  const productTypes: string[] = [];
  let after: string | null = null;
  do {
    const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: `query ProductTypes($after: String) { productTypes(first: 250, after: $after) { nodes pageInfo { hasNextPage endCursor } } }`, variables: { after } }),
    });
    const payload = await response.json() as { data?: { productTypes?: { nodes: string[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }; errors?: Array<{ message: string }> };
    const error = payload.errors?.[0]?.message;
    if (!response.ok || error || !payload.data?.productTypes) throw new AppError(error || "Shopify 自定义分类查询失败", 502);
    productTypes.push(...payload.data.productTypes.nodes.filter(Boolean));
    after = payload.data.productTypes.pageInfo.hasNextPage ? payload.data.productTypes.pageInfo.endCursor : null;
  } while (after);
  const keyword = search.trim().toLocaleLowerCase("zh-CN");
  return [...new Set(productTypes)].filter((value) => !keyword || value.toLocaleLowerCase("zh-CN").includes(keyword)).sort((left, right) => left.localeCompare(right, "zh-CN"));
}
