import { env } from "cloudflare:workers";
import { AppError } from "@/src/shared/errors";
import type { SaveProductBindingInput } from "@/src/schemas/product";
import type { VariantOptionMapping, VariantOptionMappings } from "@/src/domain/product-binding";

export type ShopifyProductOption = { id: string; name: string; position: number };

export type ShopifyProductSnapshot = {
  shopId: string; gid: string; legacyId: string; title: string; handle: string; imageUrl?: string; imageAlt?: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED"; variantCount: number; onlineStoreUrl?: string; adminUrl: string; updatedAt?: string;
  options: ShopifyProductOption[];
};

export type ShopifyCustomizationMarker = {
  enabled: boolean;
  templateCode?: string;
  templateVersion?: number;
};

export type ShopifyMaterialPreviewImage = { url: string; alt?: string; width?: number; height?: number };
export type ShopifyVariantImageField = { fileId: string; url: string; alt: string; width?: number; height?: number };
export type ShopifyVariantMetafieldDefinition = { id: string; namespace: string; key: string; name: string; description?: string; type: string; category?: string };
export type ShopifyVariantMetafieldValue = { namespace: string; key: string; type: string; value: string; image?: ShopifyVariantImageField };
export type ShopifyCustomizationVariant = {
  id: string; title: string; sku: string; material: string; available: boolean;
  metafields: ShopifyVariantMetafieldValue[];
};
export type ShopifyMaterialPreviewVariant = {
  id: string; title: string; sku: string; material: string; available: boolean;
  jacketBase?: ShopifyMaterialPreviewImage; trousersBase?: ShopifyMaterialPreviewImage;
};
export type ShopifyMaterialPreviewProduct = { id: string; title: string; variants: ShopifyMaterialPreviewVariant[] };
export type ShopifyCustomizationVariantsProduct = { id: string; title: string; definitions: ShopifyVariantMetafieldDefinition[]; variants: ShopifyCustomizationVariant[] };

type MaterialPreviewPage = {
  product: { id: string; title: string; options: ShopifyProductOption[]; variants: { nodes: Array<{
    id: string; title: string; sku?: string | null; availableForSale: boolean; selectedOptions: Array<{ name: string; value: string }>;
    jacketBase?: { reference?: { image?: { url: string; altText?: string | null; width?: number; height?: number } | null } | null } | null;
    trousersBase?: { reference?: { image?: { url: string; altText?: string | null; width?: number; height?: number } | null } | null } | null;
  }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } };
  errors?: Array<{ message: string }>;
};

const previewImage = (field: MaterialPreviewPage["product"]["variants"]["nodes"][number]["jacketBase"]): ShopifyMaterialPreviewImage | undefined => {
  const image = field?.reference?.image;
  return image ? { url: image.url, alt: image.altText || undefined, width: image.width, height: image.height } : undefined;
};

type VariantMetafieldReference = { id?: string; image?: { url: string; altText?: string | null; width?: number; height?: number } | null } | null;
type VariantMetafield = { value?: string | null; reference?: VariantMetafieldReference } | null;
const variantImage = (field?: VariantMetafield): ShopifyVariantImageField | undefined => {
  const reference = field?.reference;
  const image = reference?.image;
  return reference?.id && image ? { fileId: reference.id, url: image.url, alt: image.altText || "", width: image.width, height: image.height } : undefined;
};

function mappedOption(options: ShopifyProductOption[], mapping?: VariantOptionMapping) {
  if (mapping) return options.find((option) => option.id === mapping.shopifyOptionId);
  return options.length === 1 ? options[0] : undefined;
}

export function parseMaterialPreviewPage(payload: unknown, mapping?: VariantOptionMapping) {
  if (!payload || typeof payload !== "object") throw new AppError("Shopify 材质 SKU 查询返回了无效响应", 502);
  const body = payload as { data?: MaterialPreviewPage; errors?: Array<{ message?: string }> };
  const error = body.errors?.[0]?.message;
  if (error) throw new AppError(error, 502);
  const product = body.data?.product;
  if (!product || !Array.isArray(product.options) || !Array.isArray(product.variants?.nodes)) throw new AppError("Shopify 商品不存在或响应不完整", 404);
  const option = mappedOption(product.options, mapping);
  if (!option) throw new AppError("请在商品绑定中选择材质步骤对应的 Shopify Option", 422);
  return {
    product: { id: product.id, title: product.title },
    variants: product.variants.nodes.map((variant) => ({
      id: variant.id, title: variant.title, sku: variant.sku || "",
      material: variant.selectedOptions.find((selected) => selected.name === option.name)?.value.trim() || variant.title,
      available: variant.availableForSale, jacketBase: previewImage(variant.jacketBase), trousersBase: previewImage(variant.trousersBase),
    })),
    pageInfo: product.variants.pageInfo,
  };
}

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

export async function verifyShopifyVariant(shop: string, productId: string, variantId: string, mappings: VariantOptionMappings = {}, materialRequired = false) {
  const token = await clientCredentialsAccessToken(shop);
  const gid = variantId.startsWith("gid://") ? variantId : `gid://shopify/ProductVariant/${variantId}`;
  const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query: `query VariantForCustomization($id: ID!) { productVariant(id: $id) { id legacyResourceId sku price availableForSale selectedOptions { name value } product { legacyResourceId options { id name position } } } }`, variables: { id: gid } }) });
  const payload = await response.json() as { data?: { productVariant?: { legacyResourceId: string; sku?: string; price: string; availableForSale: boolean; selectedOptions: Array<{ name: string; value: string }>; product: { legacyResourceId: string; options: ShopifyProductOption[] } } }; errors?: Array<{ message: string }> };
  if (!response.ok || payload.errors?.length) throw new AppError(payload.errors?.[0]?.message || "Shopify Variant 查询失败", 502);
  const variant = payload.data?.productVariant;
  if (!variant || String(variant.product.legacyResourceId) !== productId) throw new AppError("Variant 不属于当前商品", 422);
  if (!variant.availableForSale) throw new AppError("当前 Variant 不可售", 422);
  const materialOption = mappings.material || materialRequired ? mappedOption(variant.product.options, mappings.material) : undefined;
  const material = materialOption ? variant.selectedOptions.find((option) => option.name === materialOption.name)?.value.trim() : undefined;
  if (mappings.material && !materialOption) throw new AppError("商品绑定的材质 Option 已不存在，请重新同步绑定", 409);
  if (materialRequired && !materialOption) throw new AppError("请在商品绑定中选择材质步骤对应的 Shopify Option", 422);
  if (mappings.material && !material) throw new AppError("当前 Variant 缺少绑定的材质 Option 值", 422);
  return { variantId: String(variant.legacyResourceId), sku: variant.sku || "", material, price: variant.price };
}

export async function getShopifyProductType(shop: string, productId: string) {
  const token = await clientCredentialsAccessToken(shop);
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

export async function queryShopifyFiles(request: Request, shopId: string, ids: string[]): Promise<unknown> {
  const context = await mutationContext(request, shopId);
  if (!context) throw new AppError("原生素材选择需要从 Shopify Admin 打开应用，本地 Mock 不提供素材", 503);
  let response: Response;
  try {
    response = await fetch(`https://${context.shop}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": context.token },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        query: `query MtmImages($ids: [ID!]!) { nodes(ids: $ids) { __typename id ... on MediaImage { fileStatus alt image { url altText width height } } } }`,
        variables: { ids },
      }),
    });
  } catch { throw new AppError("Shopify 图片查询超时或网络不可用，请重试", 502); }
  if (response.status === 401 || response.status === 403) throw new AppError("Shopify 文件读取权限不足，请确认 read_files 授权及员工文件权限", 403);
  if (!response.ok) throw new AppError("Shopify 图片查询失败，请稍后重试", 502);
  try { return await response.json(); }
  catch { throw new AppError("Shopify 图片查询返回了无效响应", 502); }
}

export async function queryShopifyMaterialPreviewProduct(request: Request, shopId: string, productGid: string, mapping?: VariantOptionMapping): Promise<ShopifyMaterialPreviewProduct> {
  const context = await mutationContext(request, shopId);
  if (!context) return { id: productGid, title: "本地预览商品", variants: [] };
  const variants: ShopifyMaterialPreviewVariant[] = [];
  let after: string | null = null;
  let product: { id: string; title: string } | undefined;
  do {
    let response: Response;
    try {
      response = await fetch(`https://${context.shop}/admin/api/2026-07/graphql.json`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": context.token }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ query: `query MaterialPreviewVariants($id: ID!, $after: String) { product(id: $id) { id title options { id name position } variants(first: 100, after: $after) { nodes { id title sku availableForSale selectedOptions { name value } jacketBase: metafield(namespace: "custom", key: "material_jacket_base") { reference { ... on MediaImage { image { url altText width height } } } } trousersBase: metafield(namespace: "custom", key: "material_trousers_base") { reference { ... on MediaImage { image { url altText width height } } } } } pageInfo { hasNextPage endCursor } } } }`, variables: { id: productGid, after } }),
      });
    } catch { throw new AppError("Shopify 材质 SKU 查询超时或网络不可用，请重试", 502); }
    if (response.status === 401 || response.status === 403) throw new AppError("Shopify Variant 元字段读取权限不足", 403);
    if (!response.ok) throw new AppError("Shopify 材质 SKU 查询失败", 502);
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new AppError("Shopify 材质 SKU 查询返回了无效响应", 502); }
    const page = parseMaterialPreviewPage(payload, mapping);
    product = page.product; variants.push(...page.variants);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor || null : null;
  } while (after);
  if (!product) throw new AppError("Shopify 商品不存在", 404);
  return { ...product, variants };
}

export async function queryShopifyCustomizationVariants(request: Request, productGid: string, optionId?: string): Promise<ShopifyCustomizationVariantsProduct> {
  const authorization = request.headers.get("Authorization");
  const sessionToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const local = isLocalRequest(request);
  if (local && request.headers.get("X-MTM-Mock-Shopify") === "1") return { id: productGid, title: "本地预览商品", definitions: [], variants: [] };
  const shop = local && env.SHOPIFY_AUTH_MODE === "client_credentials" ? configuredShop() : await authenticateSessionToken(sessionToken || "");
  const token = await accessToken(shop, sessionToken, local && env.SHOPIFY_AUTH_MODE === "client_credentials");
  const definitions: ShopifyVariantMetafieldDefinition[] = [];
  let definitionsAfter: string | null = null;
  do {
    const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({
      query: `query VariantMetafieldDefinitions($after: String) { metafieldDefinitions(first: 250, after: $after, ownerType: PRODUCTVARIANT) { nodes { id namespace key name description type { name category } } pageInfo { hasNextPage endCursor } } }`, variables: { after: definitionsAfter },
    }) });
    const payload = await response.json() as { data?: { metafieldDefinitions?: { nodes: Array<{ id: string; namespace: string; key: string; name: string; description?: string | null; type: { name: string; category?: string } }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }; errors?: Array<{ message: string }> };
    const error = payload.errors?.[0]?.message;
    const connection = payload.data?.metafieldDefinitions;
    if (!response.ok || error || !connection) throw new AppError(error || "Shopify Variant 元字段定义查询失败", 502);
    definitions.push(...connection.nodes.map((definition) => ({ id: definition.id, namespace: definition.namespace, key: definition.key, name: definition.name, description: definition.description || undefined, type: definition.type.name, category: definition.type.category })));
    definitionsAfter = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor || null : null;
  } while (definitionsAfter);
  const variants: ShopifyCustomizationVariant[] = [];
  let after: string | null = null;
  let productTitle = "";
  do {
    const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({
      query: `query CustomizationVariants($id: ID!, $after: String) { product(id: $id) { id title options { id name position } variants(first: 100, after: $after) { nodes { id title sku availableForSale selectedOptions { name value } metafields(first: 250) { nodes { namespace key type value reference { ... on MediaImage { id image { url altText width height } } } } } } pageInfo { hasNextPage endCursor } } } }`,
      variables: { id: productGid, after },
    }) });
    const payload = await response.json() as { data?: { product?: { title: string; options: ShopifyProductOption[]; variants: { nodes: Array<{ id: string; title: string; sku?: string | null; availableForSale: boolean; selectedOptions: Array<{ name: string; value: string }>; metafields: { nodes: Array<{ namespace: string; key: string; type: string; value: string; reference?: VariantMetafieldReference }> } }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } } }; errors?: Array<{ message: string }> };
    const error = payload.errors?.[0]?.message;
    if (!response.ok || error) throw new AppError(error || "Shopify Variant 定制字段查询失败", 502);
    const product = payload.data?.product;
    if (!product) throw new AppError("Shopify 商品不存在", 404);
    const option = optionId ? product.options.find((item) => item.id === optionId) : undefined;
    productTitle = product.title;
    variants.push(...product.variants.nodes.map((variant) => ({
      id: variant.id, title: variant.title, sku: variant.sku || "", available: variant.availableForSale,
      material: option ? variant.selectedOptions.find((item) => item.name === option.name)?.value || variant.title : variant.title,
      metafields: variant.metafields.nodes.map((field) => ({ namespace: field.namespace, key: field.key, type: field.type, value: field.value, image: variantImage(field) })),
    })));
    after = product.variants.pageInfo.hasNextPage ? product.variants.pageInfo.endCursor || null : null;
  } while (after);
  definitions.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  return { id: productGid, title: productTitle, definitions, variants };
}

export async function setShopifyCustomizationVariantMetafields(request: Request, productGid: string, optionId: string | undefined, variants: Array<{ id: string; metafields: Array<{ namespace: string; key: string; type: string; value: string }> }>) {
  const product = await queryShopifyCustomizationVariants(request, productGid, optionId);
  const allowed = new Set(product.variants.map((variant) => variant.id));
  if (variants.some((variant) => !allowed.has(variant.id))) throw new AppError("提交的 Variant 不属于当前商品", 422);
  const authorization = request.headers.get("Authorization");
  const sessionToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const local = isLocalRequest(request);
  if (local && request.headers.get("X-MTM-Mock-Shopify") === "1") return product;
  const shop = local && env.SHOPIFY_AUTH_MODE === "client_credentials" ? configuredShop() : await authenticateSessionToken(sessionToken || "");
  const token = await accessToken(shop, sessionToken, local && env.SHOPIFY_AUTH_MODE === "client_credentials");
  const definitionTypes = new Map(product.definitions.map((definition) => [`${definition.namespace}.${definition.key}`, definition.type]));
  const metafields = variants.flatMap((variant) => variant.metafields.flatMap((field) => {
    const expectedType = definitionTypes.get(`${field.namespace}.${field.key}`);
    if (!expectedType || expectedType !== field.type) throw new AppError(`元字段定义已变化：${field.namespace}.${field.key}`, 409);
    return field.value === "" ? [] : [{ ownerId: variant.id, namespace: field.namespace, key: field.key, type: expectedType, value: field.value }];
  }));
  for (let index = 0; index < metafields.length; index += 25) {
    const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query: `mutation SetVariantCustomizationImages($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message code } } }`, variables: { metafields: metafields.slice(index, index + 25) } }) });
    const payload = await response.json() as { data?: { metafieldsSet?: { userErrors: Array<{ message: string }> } }; errors?: Array<{ message: string }> };
    const error = payload.errors?.[0]?.message || payload.data?.metafieldsSet?.userErrors?.[0]?.message;
    if (!response.ok || error) throw new AppError(error || "Shopify Variant 定制字段写入失败", 502);
  }
  return queryShopifyCustomizationVariants(request, productGid, optionId);
}

export async function getShopifyStorefrontVariantMetafields(shop: string, productId: string, visibleKeys: string[]) {
  if (!visibleKeys.length) return { definitions: [], variants: [] };
  const allowed = new Set(visibleKeys);
  const token = await clientCredentialsAccessToken(shop);
  const productGid = productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}`;
  type Definition = { id: string; namespace: string; key: string; name: string; description?: string | null; type: { name: string; category?: string } };
  type Variant = { id: string; metafields: { nodes: Array<{ namespace: string; key: string; type: string; value: string; reference?: VariantMetafieldReference }> } };
  let after: string | null = null;
  let definitionNodes: Definition[] = [];
  const variantNodes: Variant[] = [];
  do {
    const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query: `query StorefrontVisibleVariantMetafields($id: ID!, $after: String) { metafieldDefinitions(first: 250, ownerType: PRODUCTVARIANT) { nodes { id namespace key name description type { name category } } } product(id: $id) { variants(first: 100, after: $after) { nodes { id metafields(first: 250) { nodes { namespace key type value reference { ... on MediaImage { id image { url altText width height } } } } } } pageInfo { hasNextPage endCursor } } } }`, variables: { id: productGid, after } }) });
    const payload = await response.json() as { data?: { metafieldDefinitions?: { nodes: Definition[] }; product?: { variants: { nodes: Variant[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } }; errors?: Array<{ message: string }> };
    const error = payload.errors?.[0]?.message;
    if (!response.ok || error || !payload.data?.metafieldDefinitions || !payload.data.product) throw new AppError(error || "Shopify 前台 Variant 元字段查询失败", 502);
    if (!definitionNodes.length) definitionNodes = payload.data.metafieldDefinitions.nodes;
    variantNodes.push(...payload.data.product.variants.nodes);
    after = payload.data.product.variants.pageInfo.hasNextPage ? payload.data.product.variants.pageInfo.endCursor : null;
  } while (after);
  const definitions = definitionNodes.filter((item) => allowed.has(`${item.namespace}.${item.key}`)).map((item) => ({ id: item.id, namespace: item.namespace, key: item.key, name: item.name, description: item.description || undefined, type: item.type.name, category: item.type.category }));
  const permitted = new Set(definitions.map((item) => `${item.namespace}.${item.key}`));
  const variants = variantNodes.map((variant) => ({ id: variant.id, metafields: variant.metafields.nodes.filter((field) => permitted.has(`${field.namespace}.${field.key}`)).map((field) => ({ namespace: field.namespace, key: field.key, type: field.type, value: field.value, image: variantImage(field) })) }));
  return { definitions, variants };
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
      onlineStoreUrl: input.mockProduct.onlineStoreUrl, adminUrl: `https://admin.shopify.com/store/local-dev/products/${legacyId}`, updatedAt: input.mockProduct.updatedAt,
      options: (input.mockProduct.options || []).map((option) => ({ id: option.shopifyOptionId, name: option.name, position: option.position })) };
  }
  const authorization = request.headers.get("Authorization");
  const sessionToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const shop = useClientCredentials ? configuredShop() : await authenticateSessionToken(sessionToken || "");
  const token = await accessToken(shop, sessionToken, useClientCredentials);
  const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({
    query: `query ProductForBinding($id: ID!) { product(id: $id) { id legacyResourceId title handle status updatedAt onlineStoreUrl options { id name position } featuredMedia { preview { image { url altText } } } variantsCount { count } } }`,
    variables: { id: input.shopifyProductGid },
  }) });
  if (!response.ok) throw new AppError("Shopify 商品查询失败", 502);
  const payload = await response.json() as { data?: { product?: { id: string; legacyResourceId: string; title: string; handle: string; status: "ACTIVE" | "DRAFT" | "ARCHIVED"; updatedAt: string; onlineStoreUrl?: string; options: ShopifyProductOption[]; featuredMedia?: { preview?: { image?: { url: string; altText?: string } } }; variantsCount: { count: number } } }; errors?: Array<{ message: string }> };
  if (payload.errors?.length) throw new AppError(payload.errors[0].message, 502);
  const product = payload.data?.product;
  if (!product) throw new AppError("Shopify 商品不存在", 404);
  return { shopId: shop, gid: product.id, legacyId: String(product.legacyResourceId), title: product.title, handle: product.handle,
    imageUrl: product.featuredMedia?.preview?.image?.url, imageAlt: product.featuredMedia?.preview?.image?.altText, status: product.status,
    variantCount: product.variantsCount.count, onlineStoreUrl: product.onlineStoreUrl, options: product.options,
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
