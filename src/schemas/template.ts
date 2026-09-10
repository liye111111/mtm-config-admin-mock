import { z } from "zod";
import { TEMPLATE_SCHEMA_VERSION, type TemplateConfig } from "@/src/domain";
import { AppError } from "@/src/shared/errors";
import { parseWithSchema } from "./parse";
import { imageReferenceSchema } from "./media";

const codeSchema = z.string().trim().min(1, "编码不能为空").regex(/^[a-z][a-z0-9_]*$/, "编码必须以小写英文字母开头，并且只能包含小写字母、数字和下划线");
export const garmentCategorySchema = codeSchema;
const measurementUnitSchema = z.enum(["CM", "IN", "KG"]);
function withoutLegacyField(value: unknown, field: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const clean = { ...value } as Record<string, unknown>;
  delete clean[field];
  return clean;
}

export const customizationOptionSchema = z.preprocess((value) => withoutLegacyField(value, "previewImage"), z.object({
  id: z.string().trim().min(1),
  code: codeSchema,
  name: z.string().trim().min(1, "选项名称不能为空"),
  description: z.string().trim().optional(),
  displayImage: imageReferenceSchema.optional(),
  previewLayer: z.discriminatedUnion("type", [
    z.object({ type: z.literal("image"), image: imageReferenceSchema }).strict(),
    z.object({ type: z.literal("empty") }).strict(),
  ]).optional(),
  badge: z.object({ text: z.string().trim().max(80), type: z.literal("discount").default("discount") }).strict().optional(),
  sortOrder: z.number().int().nonnegative(),
  enabled: z.boolean(),
  defaultSelected: z.boolean(),
  applicableCategories: z.array(garmentCategorySchema),
  affectsPrice: z.literal(false),
}).strict());

export const optionGroupSchema = z.object({
  id: z.string().trim().min(1),
  code: codeSchema,
  title: z.string().trim().min(1, "选项组名称不能为空"),
  description: z.string().trim().optional(),
  displayStyle: z.enum(["image_text", "text", "icon_text"]),
  required: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  previewEnabled: z.boolean().default(false),
  previewLayerOrder: z.number().int().nonnegative().default(0),
  options: z.array(customizationOptionSchema).max(200),
}).strict();

export const textInputConfigSchema = z.object({
  minLength: z.number().int().nonnegative("最小字符数不能小于 0"),
  maxLength: z.number().int().positive("最大字符数必须大于 0").max(200, "最大字符数不能超过 200"),
  placeholder: z.string().trim().max(100, "占位文案不能超过 100 个字符").optional(),
  characterPolicy: z.enum(["letters_only", "letters_numbers_spaces", "unicode_text"]),
}).refine((config) => config.minLength <= config.maxLength, { message: "最小字符数不能大于最大字符数", path: ["minLength"] });

const embroideryChoiceSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, "刺绣字典名称不能为空"),
  description: z.string().trim().max(200, "刺绣选项说明不能超过 200 个字符").optional(),
});

export const embroideryConfigSchema = z.object({
  positions: z.array(embroideryChoiceSchema),
  fonts: z.array(embroideryChoiceSchema),
  colors: z.array(embroideryChoiceSchema),
});

export const customizationStepSchema = z.preprocess((value) => withoutLegacyField(value, "defaultPreviewImage"), z.object({
  id: z.string().trim().min(1),
  code: codeSchema,
  title: z.string().trim().min(1, "步骤名称不能为空"),
  description: z.string().trim().optional(),
  type: z.enum(["options", "embroidery", "components", "measurements", "review"]),
  required: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  optionGroups: z.array(optionGroupSchema).max(50),
  textInput: textInputConfigSchema.optional(),
  embroidery: embroideryConfigSchema.optional(),
}).strict());

export const garmentComponentSchema = z.object({
  id: z.string().trim().min(1),
  code: codeSchema,
  name: z.string().trim().min(1, "组件名称不能为空"),
  category: garmentCategorySchema,
  childTemplateId: z.string().trim(),
  customizationEnabled: z.boolean(),
  required: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export const measurementFieldSchema = z.object({
  id: z.string().trim().min(1),
  attributeId: z.string().trim().min(1, "请选择量体属性"),
  labelOverride: z.string().trim().optional(),
  descriptionOverride: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  inputUnit: z.enum(["MM", "CM", "IN", "KG", "LB", "CHI", "NONE"]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  required: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
}).transform((field) => ({
  ...field,
  // 字段一旦被加入模板就应展示；旧的“未启用”语义迁移为“选填”。
  required: field.enabled ? field.required : false,
  enabled: true,
}));

export const dimensionFieldSchema = z.object({
  id: z.string().trim().min(1), code: codeSchema,
  name: z.string().trim().min(1, "尺寸字段名称不能为空"),
  description: z.string().trim().optional(), imageUrl: z.string().trim().optional(),
  standardUnit: measurementUnitSchema, min: z.number(), max: z.number(),
  step: z.number().positive("尺寸步长必须大于 0"), required: z.boolean(),
  enabled: z.boolean(), sortOrder: z.number().int().nonnegative(),
});

export const measurementBlockSchema = z.object({
  id: z.string().trim().min(1),
  code: codeSchema,
  name: z.string().trim().min(1, "尺寸块名称不能为空"),
  description: z.string().trim().optional(),
  applicableCategories: z.array(garmentCategorySchema),
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  fields: z.array(measurementFieldSchema),
});

export const dimensionBlockSchema = measurementBlockSchema.extend({ fields: z.array(dimensionFieldSchema) });

export const templateConfigSchema = z.object({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  previewMode: z.enum(["none", "layered"]).default("none"),
  previewDisplayImage: imageReferenceSchema.optional(),
  previewCanvas: z.object({ baseImage: imageReferenceSchema }).strict().optional(),
  buttonLabel: z.string().trim().min(1, "前台按钮文字不能为空"),
  pricingMode: z.literal("none"),
  templateType: z.enum(["single", "composite"]),
  orderLineMode: z.literal("single_line"),
  components: z.array(garmentComponentSchema),
  steps: z.array(customizationStepSchema).max(100),
  measurementBlocks: z.array(measurementBlockSchema),
  dimensionBlocks: z.array(dimensionBlockSchema).default([]),
});

export function createEmptyTemplateConfig(): TemplateConfig {
  return { schemaVersion: 3, previewMode: "none", buttonLabel: "开始定制", pricingMode: "none", templateType: "single", orderLineMode: "single_line", components: [], steps: [], measurementBlocks: [], dimensionBlocks: [] };
}

export function parseStoredTemplateConfig(json: string, schemaVersion: number): TemplateConfig {
  if (schemaVersion !== TEMPLATE_SCHEMA_VERSION) throw new AppError(`配置已更新：不支持模板 Schema v${schemaVersion}，请重新配置 v${TEMPLATE_SCHEMA_VERSION} 模板`, 409);
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new AppError("模板配置 JSON 无效", 500); }
  const result = templateConfigSchema.safeParse(value);
  if (!result.success) throw new AppError(`模板配置不符合 Schema v${TEMPLATE_SCHEMA_VERSION}：${result.error.issues[0]?.message ?? "未知错误"}`, 500);
  return result.data;
}

export const createTemplateSchema = z.object({
  name: z.string().trim().transform((value) => value || "新定制模板").default("新定制模板"),
  category: garmentCategorySchema.default("jacket"),
  config: templateConfigSchema.default(createEmptyTemplateConfig()),
});

export const saveTemplateSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, "模板名称不能为空"),
  category: garmentCategorySchema,
  config: templateConfigSchema,
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;
export function parseCreateTemplate(value: unknown): CreateTemplateInput { return parseWithSchema(createTemplateSchema, value); }
export function parseSaveTemplate(value: unknown): SaveTemplateInput { return parseWithSchema(saveTemplateSchema, value); }
