import type { GarmentCategory, IsoDateTime, TemplateStatus, TemplateType } from "./common";
import type { DimensionFieldDefinition, MeasurementBlock } from "./measurement";
import type { ImageReference, OptionGroup } from "./option";

export type StepType = "options" | "embroidery" | "components" | "measurements" | "review";

export type TextInputConfig = {
  minLength: number;
  maxLength: number;
  placeholder?: string;
  characterPolicy: "letters_only" | "letters_numbers_spaces" | "unicode_text";
};

export type EmbroideryChoice = {
  code: string;
  name: string;
};

export type EmbroideryConfig = {
  positions: EmbroideryChoice[];
  fonts: EmbroideryChoice[];
  colors: EmbroideryChoice[];
};

export const DEFAULT_EMBROIDERY_CONFIG: EmbroideryConfig = {
  positions: [
    { code: "inside_jacket", name: "西服内侧" },
    { code: "left_cuff", name: "左袖口" },
    { code: "right_cuff", name: "右袖口" },
  ],
  fonts: [
    { code: "standard", name: "标准体" },
    { code: "script", name: "手写体" },
    { code: "serif", name: "衬线体" },
  ],
  colors: [
    { code: "black", name: "黑色" },
    { code: "navy", name: "藏青色" },
    { code: "silver", name: "银灰色" },
    { code: "gold", name: "金色" },
  ],
};

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
  defaultPreviewImage?: ImageReference;
  required: boolean;
  enabled: boolean;
  sortOrder: number;
  optionGroups: OptionGroup[];
  textInput?: TextInputConfig;
  embroidery?: EmbroideryConfig;
};

export type TemplateConfig = {
  schemaVersion: 3;
  buttonLabel: string;
  pricingMode: "none";
  templateType: TemplateType;
  orderLineMode: "single_line";
  components: GarmentComponentDefinition[];
  steps: CustomizationStep[];
  measurementBlocks: MeasurementBlock[];
  dimensionBlocks: MeasurementBlock<DimensionFieldDefinition>[];
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
