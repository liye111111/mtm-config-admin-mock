import type { GarmentCategory, MeasurementUnit } from "./common";
import type { MeasurementCanonicalUnit, MeasurementDimension, MeasurementAttributeValueType } from "./measurement-attribute";

export type MeasurementFieldDefinition = {
  id: string;
  attributeId: string;
  labelOverride?: string;
  descriptionOverride?: string;
  imageUrl?: string;
  inputUnit: MeasurementCanonicalUnit;
  min: number;
  max: number;
  step: number;
  required: boolean;
  enabled: boolean;
  sortOrder: number;
};

export type ResolvedMeasurementFieldDefinition = MeasurementFieldDefinition & {
  code: string;
  name: string;
  description?: string;
  valueType: MeasurementAttributeValueType;
  dimension: MeasurementDimension;
  standardUnit: MeasurementCanonicalUnit;
  precision: number;
};

export type DimensionFieldDefinition = {
  id: string; code: string; name: string; description?: string; imageUrl?: string;
  standardUnit: MeasurementUnit; min: number; max: number; step: number;
  required: boolean; enabled: boolean; sortOrder: number;
};

export type MeasurementBlock<TField = MeasurementFieldDefinition> = {
  id: string;
  code: string;
  name: string;
  description?: string;
  applicableCategories: GarmentCategory[];
  enabled: boolean;
  sortOrder: number;
  fields: TField[];
};
