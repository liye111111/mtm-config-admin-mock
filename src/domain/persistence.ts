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
  shopify_product_id: string;
  product_title: string;
  product_handle: string | null;
  template_id: string;
  published_version: number | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};

