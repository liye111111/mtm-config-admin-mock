import type { IsoDateTime } from "./common";

export type BoundProductKind = "single" | "suite";
export type ShopifyProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";
export type ProductSyncStatus = "synced" | "stale" | "error";

export type ProductTemplateBinding = {
  id: string;
  shopId: string;
  shopifyProductGid: string;
  shopifyProductId: string;
  productTitle: string;
  productHandle: string;
  productImageUrl?: string;
  productImageAlt?: string;
  productStatus: ShopifyProductStatus;
  productKind: BoundProductKind;
  variantCount: number;
  onlineStoreUrl?: string;
  shopifyAdminUrl?: string;
  templateId: string;
  publishedVersion: number | null;
  enabled: boolean;
  syncStatus: ProductSyncStatus;
  syncError?: string;
  shopifyUpdatedAt?: IsoDateTime;
  lastSyncedAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};
