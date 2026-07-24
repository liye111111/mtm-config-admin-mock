import type { GarmentCategory } from "./common";

export type DisplayType = "image_card" | "color_swatch" | "radio" | "select" | "text_input";

export type CustomizationOption = {
  id: string;
  code: string;
  name: string;
  description?: string;
  imageUrl?: string;
  sortOrder: number;
  enabled: boolean;
  defaultSelected: boolean;
  applicableCategories: GarmentCategory[];
  affectsPrice: false;
};

