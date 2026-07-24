import { garmentCategoryLabels, type GarmentCategory } from "./common";
import type { ProductBindingRow, TemplateRow } from "./persistence";
import type { TemplateConfig } from "./template";
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
    shopifyProductId: row.shopify_product_id,
    productTitle: row.product_title,
    productHandle: row.product_handle || "",
    templateId: row.template_id,
    publishedVersion: row.published_version,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
