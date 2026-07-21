export type TemplateStatus = "draft" | "published";
export type Choice = { value: string; label: string };
export type ConfigStep = { id?: string; code: string; title: string; type: string; required?: boolean; options?: Choice[] };
export type CompositePiece = { code?: string; name?: string; templateId?: string; [key: string]: unknown };
export type TemplateConfig = {
  templateType?: string;
  orderLineMode?: string;
  pieceSelection?: { min?: number; max?: number };
  pieces?: CompositePiece[];
  steps?: ConfigStep[];
  [key: string]: unknown;
};
export type TemplateRow = { id: string; code: string; name: string; category: string; status: TemplateStatus; version: number; config_json: string; created_at: string; updated_at: string };
export type ProductBindingRow = { id: string; shopify_product_id: string; product_title: string; product_handle: string | null; template_id: string; published_version: number | null; created_at: string; updated_at: string };

export function templateView(row: TemplateRow) {
  return { id: row.id, code: row.code, name: row.name, category: row.category, status: row.status, version: row.version, config: JSON.parse(row.config_json) as TemplateConfig, createdAt: row.created_at, updatedAt: row.updated_at };
}
export function productBindingView(row: ProductBindingRow) {
  return { id: row.id, shopifyProductId: row.shopify_product_id, productTitle: row.product_title, productHandle: row.product_handle || "", templateId: row.template_id, publishedVersion: row.published_version, createdAt: row.created_at, updatedAt: row.updated_at };
}
