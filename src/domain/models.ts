import { garmentCategoryLabels, type GarmentCategory } from "./common";
import type { ProductBindingRow, TemplateRow } from "./persistence";
import type { TemplateConfig } from "./template";
import type { BoundProductKind, ProductSyncStatus, ShopifyProductStatus } from "./product-binding";
import { parseStoredTemplateConfig } from "@/src/schemas/template";

export type { ProductBindingRow, TemplateRow, TemplateConfig };

export function templateView(row: TemplateRow) {
  const category = row.category as GarmentCategory;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category,
    categoryLabel: garmentCategoryLabels[category],
    status: row.status,
    version: row.version,
    schemaVersion: row.schema_version,
    config: parseStoredTemplateConfig(row.config_json, row.schema_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function productBindingView(row: ProductBindingRow) {
  return {
    id: row.id,
    shopId: row.shop_id,
    shopifyProductGid: row.shopify_product_gid,
    shopifyProductId: row.shopify_product_id,
    productTitle: row.product_title,
    productHandle: row.product_handle || "",
    productImageUrl: row.product_image_url || undefined,
    productImageAlt: row.product_image_alt || undefined,
    productStatus: row.product_status as ShopifyProductStatus,
    productKind: row.product_kind as BoundProductKind,
    variantCount: row.variant_count,
    onlineStoreUrl: row.online_store_url || undefined,
    shopifyAdminUrl: row.shopify_admin_url || undefined,
    templateId: row.template_id,
    publishedVersion: row.published_version,
    enabled: row.enabled === 1,
    syncStatus: row.sync_status as ProductSyncStatus,
    syncError: row.sync_error || undefined,
    shopifyUpdatedAt: row.shopify_updated_at || undefined,
    lastSyncedAt: row.last_synced_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
