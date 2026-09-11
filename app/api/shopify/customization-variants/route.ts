import { route } from "@/src/middleware/http";
import { AppError } from "@/src/shared/errors";
import { queryShopifyCustomizationVariants, setShopifyCustomizationVariantMetafields } from "@/src/integrations/shopify-admin";

const productGid = (value: unknown) => {
  const gid = typeof value === "string" ? value.trim() : "";
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(gid)) throw new AppError("Shopify Product GID 无效", 422);
  return gid;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  return route(() => queryShopifyCustomizationVariants(request, productGid(url.searchParams.get("productGid")), url.searchParams.get("optionId") || undefined));
}

export async function PUT(request: Request) {
  return route(async () => {
    const body = await request.json() as { productGid?: unknown; optionId?: unknown; variants?: unknown };
    if (!Array.isArray(body.variants)) throw new AppError("Variant 定制字段列表无效", 422);
    const variants = body.variants.map((item) => {
      if (!item || typeof item !== "object") throw new AppError("Variant 定制字段无效", 422);
      const value = item as Record<string, unknown>;
      if (typeof value.id !== "string" || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(value.id)) throw new AppError("Shopify Variant GID 无效", 422);
      if (!Array.isArray(value.metafields)) throw new AppError("Variant 元字段列表无效", 422);
      const metafields = value.metafields.map((field) => {
        if (!field || typeof field !== "object") throw new AppError("Variant 元字段无效", 422);
        const item = field as Record<string, unknown>;
        if (![item.namespace, item.key, item.type, item.value].every((part) => typeof part === "string")) throw new AppError("Variant 元字段内容无效", 422);
        if (!/^[a-zA-Z0-9_$-]+$/.test(item.namespace as string) || !/^[a-zA-Z0-9_-]+$/.test(item.key as string)) throw new AppError("Variant 元字段身份无效", 422);
        return { namespace: item.namespace as string, key: item.key as string, type: item.type as string, value: item.value as string };
      });
      return { id: value.id, metafields };
    });
    const optionId = typeof body.optionId === "string" && body.optionId ? body.optionId : undefined;
    return setShopifyCustomizationVariantMetafields(request, productGid(body.productGid), optionId, variants);
  });
}
