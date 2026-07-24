import type { GarmentCategory, MeasurementBlock, TemplateConfig, TemplateStatus } from "@/src/domain";

export type TemplateView = {
  id: string;
  code: string;
  name: string;
  category: GarmentCategory;
  categoryLabel: string;
  status: TemplateStatus;
  version: number;
  schemaVersion: number;
  config: TemplateConfig;
  createdAt: string;
  updatedAt: string;
};

export type ProductBindingView = {
  id: string;
  shopifyProductId: string;
  productTitle: string;
  productHandle: string;
  templateId: string;
  publishedVersion: number | null;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type TemplateVersionView = {
  id: string;
  templateId: string;
  version: number;
  schemaVersion: number;
  config: TemplateConfig;
  publishedAt: string;
};

export type TemplateTab = "base" | "components" | "steps" | "measurements" | "versions" | "json";
export type MutableMeasurementBlock = MeasurementBlock;

