import type { IsoDateTime } from "./common";

export type ProductTemplateBinding = {
  id: string;
  shopifyProductId: string;
  productTitle: string;
  productHandle: string;
  templateId: string;
  publishedVersion: number | null;
  enabled: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

