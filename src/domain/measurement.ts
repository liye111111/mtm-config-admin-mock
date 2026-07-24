import type { GarmentCategory, MeasurementUnit } from "./common";

export type MeasurementFieldDefinition = {
  id: string;
  code: string;
  name: string;
  description?: string;
  imageUrl?: string;
  standardUnit: MeasurementUnit;
  min: number;
  max: number;
  step: number;
  required: boolean;
  enabled: boolean;
  sortOrder: number;
};

export type MeasurementBlock = {
  id: string;
  code: string;
  name: string;
  description?: string;
  applicableCategories: GarmentCategory[];
  enabled: boolean;
  sortOrder: number;
  fields: MeasurementFieldDefinition[];
};

