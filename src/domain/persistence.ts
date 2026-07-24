import type { TemplateStatus } from "./common";

export type TemplateRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  status: TemplateStatus;
  version: number;
  schema_version: number;
  config_json: string;
  created_at: string;
  updated_at: string;
};

export type TemplateVersionRow = {
  id: string;
  template_id: string;
  version: number;
  schema_version: number;
  config_json: string;
  published_at: string;
};

export type ProductBindingRow = {
  id: string;
  shop_id: string;
  shopify_product_gid: string;
  shopify_product_id: string;
  product_title: string;
  product_handle: string;
  product_image_url: string | null;
  product_image_alt: string | null;
  product_status: string;
  product_kind: string;
  variant_count: number;
  online_store_url: string | null;
  shopify_admin_url: string | null;
  template_id: string;
  published_version: number | null;
  enabled: number;
  sync_status: string;
  sync_error: string | null;
  shopify_updated_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomizationInstanceRow = { id: string; shop_id: string; shopify_product_id: string; shopify_variant_id: string; shopify_sku: string | null; template_id: string; template_code: string; template_version: number; schema_version: number; status: "validated" | "added_to_cart"; selection_snapshot_json: string; component_snapshot_json: string; measurement_snapshot_json: string; summary: string; idempotency_key: string; customer_id: string | null; cart_token_hash: string | null; created_at: string; updated_at: string };
