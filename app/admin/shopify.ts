import type { ShopifyProductSelection } from "./types";

const mocks: ShopifyProductSelection[] = [
  { gid: "gid://shopify/Product/10296845205799", title: "MTM POC 定制西服", handle: "mtm-poc-custom-suit", status: "ACTIVE", variantCount: 6, imageUrl: "https://cdn.shopify.com/static/images/blank-image.svg" },
  { gid: "gid://shopify/Product/10296845205800", title: "男士西服三件套", handle: "mens-three-piece-suit", status: "ACTIVE", variantCount: 8, imageUrl: "https://cdn.shopify.com/static/images/blank-image.svg" },
];

export function isShopifyEmbedded() { return typeof window !== "undefined" && Boolean(window.shopify?.resourcePicker); }

export async function selectShopifyProduct(): Promise<ShopifyProductSelection | undefined> {
  if (!isShopifyEmbedded()) return mocks[0];
  const selected = await window.shopify?.resourcePicker({ type: "product", multiple: false, filter: { variants: false, status: "active" } });
  const product = selected?.[0]; if (!product) return undefined;
  return { gid: product.id, title: product.title, handle: product.handle ?? "", imageUrl: product.images?.[0]?.originalSrc, imageAlt: product.images?.[0]?.altText,
    status: product.status === "ARCHIVED" || product.status === "DRAFT" ? product.status : "ACTIVE", variantCount: product.variants?.length ?? 0 };
}
