import type { GarmentCategory, IsoDateTime, TemplateStatus, TemplateType } from "./common";
import type { MeasurementBlock } from "./measurement";
import type { CustomizationOption, DisplayType } from "./option";

export type StepType = "variant" | "options" | "components" | "measurements" | "review";

export type GarmentComponentDefinition = {
  id: string;
  code: string;
  name: string;
  category: GarmentCategory;
  childTemplateId: string;
  customizationEnabled: boolean;
  required: boolean;
  sortOrder: number;
};

export type CustomizationStep = {
  id: string;
  code: string;
  title: string;
  description?: string;
  type: StepType;
  displayType?: DisplayType;
  required: boolean;
  enabled: boolean;
  sortOrder: number;
  options: CustomizationOption[];
};

export type TemplateConfig = {
  schemaVersion: 2;
  buttonLabel: string;
  pricingMode: "none";
  templateType: TemplateType;
  orderLineMode: "single_line";
  components: GarmentComponentDefinition[];
  steps: CustomizationStep[];
  measurementBlocks: MeasurementBlock[];
};

export type CustomizationTemplate = {
  id: string;
  code: string;
  name: string;
  category: GarmentCategory;
  categoryLabel: string;
  status: TemplateStatus;
  version: number;
  config: TemplateConfig;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};
