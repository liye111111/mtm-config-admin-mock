import type { GarmentCategory, MeasurementAttribute, MeasurementBlock, TemplateConfig, TemplateStatus } from "@/src/domain";

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
export type TemplateCategoryView = { id:string; code:string; name:string; sortOrder:number; templateCount:number; createdAt:string; updatedAt:string };

export type ProductBindingView = {
  id: string;
  shopId: string;
  shopifyProductGid: string;
  shopifyProductId: string;
  productTitle: string;
  productHandle: string;
  productImageUrl?: string;
  productImageAlt?: string;
  productStatus: "ACTIVE" | "DRAFT" | "ARCHIVED";
  productKind: "single" | "suite";
  variantCount: number;
  onlineStoreUrl?: string;
  shopifyAdminUrl?: string;
  templateId: string;
  publishedVersion: number | null;
  enabled: boolean;
  syncStatus: "synced" | "stale" | "error";
  syncError?: string;
  shopifyUpdatedAt?: string;
  lastSyncedAt?: string;
  mockProduct?: ShopifyProductSelection;
  createdAt?: string;
  updatedAt?: string;
};

export type ShopifyProductSelection = {
  gid: string; title: string; handle: string; imageUrl?: string; imageAlt?: string; status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  variantCount: number; onlineStoreUrl?: string; updatedAt?: string;
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

export type MeasurementProfileAdminView = {
  id: string;
  shopId: string;
  ownerType: "customer" | "guest";
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  unit: "CM" | "IN";
  schemaVersion: number;
  fieldCount: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MeasurementProfileFilter = "all" | "customer" | "guest" | "activeGuest";
export type MeasurementProfilePage = {
  items: MeasurementProfileAdminView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: { total: number; customer: number; guest: number; activeGuest: number };
};

export type CustomerMeasurementProfileDetail = {
  id: string;
  shopId: string;
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  unit: "CM" | "IN";
  schemaVersion: number;
  measurements: Record<string, number>;
  updatedAt: string;
};
export type MutableMeasurementBlock = MeasurementBlock;
export type MeasurementAttributeView = MeasurementAttribute;
export type MeasurementAttributeDraft = Omit<MeasurementAttributeView, "shopId" | "referenceCount" | "createdAt" | "updatedAt">;
