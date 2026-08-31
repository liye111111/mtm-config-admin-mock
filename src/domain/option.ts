import type { GarmentCategory } from "./common";

export type DisplayStyle = "image_text" | "text" | "icon_text";

export type ImageReference = {
  fileId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
};

export type OptionGroup = {
  id: string;
  code: string;
  title: string;
  description?: string;
  displayStyle: DisplayStyle;
  required: boolean;
  enabled: boolean;
  sortOrder: number;
  options: CustomizationOption[];
};

export type CustomizationOption = {
  id: string;
  code: string;
  name: string;
  description?: string;
  displayImage?: ImageReference;
  previewImage?: ImageReference;
  badge?: { text: string; type: "discount" };
  sortOrder: number;
  enabled: boolean;
  defaultSelected: boolean;
  applicableCategories: GarmentCategory[];
  affectsPrice: false;
};
