export type TemplateStatus = "draft" | "published";
export type TemplateType = "single" | "composite";
export type GarmentCategory = string;
export type MeasurementUnit = "CM" | "IN" | "KG";
export type IsoDateTime = string;

export const TEMPLATE_SCHEMA_VERSION = 3;

export const garmentCategoryLabels: Record<string, string> = {
  suit: "套装",
  jacket: "西服",
  trousers: "西裤",
  shirt: "衬衫",
  waistcoat: "马甲",
  curtain: "窗帘",
};
