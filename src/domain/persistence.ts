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
  category_label?: string;
};

export type TemplateCategoryRow = { id: string; code: string; name: string; sort_order: number; created_at: string; updated_at: string; template_count?: number };

export type MeasurementAttributeRow = {
  id: string;
  shop_id: string;
  code: string;
  name: string;
  description: string | null;
  value_type: "number" | "enum";
  dimension: "length" | "weight" | "size_code" | "none";
  canonical_unit: "MM" | "CM" | "IN" | "KG" | "LB" | "CHI" | "NONE";
  precision: number;
  aliases_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  reference_count?: number;
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

export type CustomizationInstanceRow = { id: string; shop_id: string; shopify_product_id: string; shopify_variant_id: string; shopify_sku: string | null; template_id: string; template_code: string; template_version: number; schema_version: number; status: "validated" | "added_to_cart" | "ordered"; selection_snapshot_json: string; component_snapshot_json: string; measurement_snapshot_json: string; summary: string; idempotency_key: string; customer_id: string | null; cart_token_hash: string | null; created_at: string; updated_at: string };

export type OrderWebhookSnapshotRow = { id: string; shop_id: string; webhook_id: string; topic: string; shopify_order_id: string | null; payload_json: string; status: "received" | "processed" | "failed"; error: string | null; received_at: string; processed_at: string | null };

export type MeasurementProfileRow = {
  id: string;
  shop_id: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  guest_id_hash: string | null;
  unit: "CM" | "IN";
  schema_version: number;
  measurements_json: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SizeChartRow = {
  id: string;
  shop_id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "disabled";
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  current_version?: number | null;
  draft_version_id?: string | null;
  draft_version?: number | null;
  draft_config_json?: string | null;
};

export type SizeChartVersionRow = {
  id: string;
  size_chart_id: string;
  version: number;
  status: "draft" | "published" | "archived";
  algorithm_code: "range_matrix" | "nearest_profile" | "direct_lookup";
  algorithm_version: number;
  config_json: string;
  created_at: string;
  published_at: string | null;
};

export type ProductTypeSizeChartBindingRow = {
  id: string;
  shop_id: string;
  product_type: string;
  normalized_product_type: string;
  size_chart_id: string;
  size_chart_name?: string;
  size_chart_code?: string;
  created_at: string;
  updated_at: string;
};
