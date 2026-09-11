import type { ShopifyProductSelection } from "./types";

const mocks: ShopifyProductSelection[] = [
  { gid: "gid://shopify/Product/10296845205799", title: "MTM POC 定制西服", handle: "mtm-poc-custom-suit", status: "ACTIVE", variantCount: 6, imageUrl: "https://cdn.shopify.com/static/images/blank-image.svg", options: [{ shopifyOptionId: "gid://shopify/ProductOption/1001", name: "面料", position: 1 }] },
  { gid: "gid://shopify/Product/10296845205800", title: "男士西服三件套", handle: "mens-three-piece-suit", status: "ACTIVE", variantCount: 8, imageUrl: "https://cdn.shopify.com/static/images/blank-image.svg", options: [{ shopifyOptionId: "gid://shopify/ProductOption/1002", name: "Fabric", position: 1 }] },
];

export function isShopifyEmbedded() { return typeof window !== "undefined" && Boolean(window.shopify?.resourcePicker); }

export async function selectShopifyProducts(multiple: boolean): Promise<ShopifyProductSelection[] | undefined> {
  if (!isShopifyEmbedded()) return multiple ? mocks : [mocks[0]];
  const selected = await window.shopify?.resourcePicker({ type: "product", multiple, filter: { variants: false, status: "active" } });
  if (!selected) return undefined;
  return selected.map((product) => ({
    gid: product.id,
    title: product.title,
    handle: product.handle ?? "",
    imageUrl: product.images?.[0]?.originalSrc,
    imageAlt: product.images?.[0]?.altText,
    status: product.status === "ARCHIVED" || product.status === "DRAFT" ? product.status : "ACTIVE",
    variantCount: product.variants?.length ?? 0,
    options: product.options?.map((option) => ({ shopifyOptionId: option.id, name: option.name, position: option.position })),
  }));
}
