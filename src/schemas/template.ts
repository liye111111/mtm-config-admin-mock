import { z } from "zod";
import { TEMPLATE_SCHEMA_VERSION, type TemplateConfig } from "@/src/domain";
import { AppError } from "@/src/shared/errors";
import { parseWithSchema } from "./parse";

const codeSchema = z.string().trim().min(1, "编码不能为空").regex(/^[a-z][a-z0-9_]*$/, "编码必须以小写英文字母开头，并且只能包含小写字母、数字和下划线");
export const garmentCategorySchema = z.enum(["suit", "jacket", "trousers", "shirt", "waistcoat"]);
const measurementUnitSchema = z.enum(["CM", "IN", "KG"]);

export const customizationOptionSchema = z.object({
  id: z.string().trim().min(1),
  code: codeSchema,
  name: z.string().trim().min(1, "选项名称不能为空"),
  description: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  sortOrder: z.number().int().nonnegative(),
  enabled: z.boolean(),
  defaultSelected: z.boolean(),
  applicableCategories: z.array(garmentCategorySchema),
  affectsPrice: z.literal(false),
});

export const customizationStepSchema = z.object({
  id: z.string().trim().min(1),
  code: codeSchema,
  title: z.string().trim().min(1, "步骤名称不能为空"),
  description: z.string().trim().optional(),
  type: z.enum(["variant", "options", "components", "measurements", "review"]),
  displayType: z.enum(["image_card", "color_swatch", "radio", "select", "text_input"]).optional(),
  required: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  options: z.array(customizationOptionSchema),
});

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
  code: codeSchema,
  name: z.string().trim().min(1, "尺寸字段名称不能为空"),
  description: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  standardUnit: measurementUnitSchema,
  min: z.number(),
  max: z.number(),
  step: z.number().positive("尺寸步长必须大于 0"),
  required: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
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

export const templateConfigSchema = z.object({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  buttonLabel: z.string().trim().min(1, "前台按钮文字不能为空"),
  pricingMode: z.literal("none"),
  templateType: z.enum(["single", "composite"]),
  orderLineMode: z.literal("single_line"),
  components: z.array(garmentComponentSchema),
  steps: z.array(customizationStepSchema),
  measurementBlocks: z.array(measurementBlockSchema),
});

export function createEmptyTemplateConfig(): TemplateConfig {
  return { schemaVersion: 2, buttonLabel: "开始定制", pricingMode: "none", templateType: "single", orderLineMode: "single_line", components: [], steps: [], measurementBlocks: [] };
}

export function parseStoredTemplateConfig(json: string, schemaVersion: number): TemplateConfig {
  if (schemaVersion !== TEMPLATE_SCHEMA_VERSION) throw new AppError(`不支持模板 Schema v${schemaVersion}，当前只支持 v${TEMPLATE_SCHEMA_VERSION}`, 500);
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
