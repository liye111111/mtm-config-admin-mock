export type MeasurementAttributeValueType = "number" | "enum";
export type MeasurementDimension = "length" | "weight" | "size_code" | "none";
export type MeasurementCanonicalUnit = "MM" | "CM" | "IN" | "KG" | "LB" | "CHI" | "NONE";

export type MeasurementAttribute = {
  id: string;
  shopId: string;
  code: string;
  name: string;
  description?: string;
  valueType: MeasurementAttributeValueType;
  dimension: MeasurementDimension;
  canonicalUnit: MeasurementCanonicalUnit;
  precision: number;
  aliases: string[];
  enabled: boolean;
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
};

export const compatibleMeasurementUnits: Record<MeasurementDimension, MeasurementCanonicalUnit[]> = {
  length: ["MM", "CM", "IN", "CHI"],
  weight: ["KG", "LB"],
  size_code: ["NONE"],
  none: ["NONE"],
};
