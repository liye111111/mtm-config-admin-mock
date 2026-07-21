import { z } from "zod";
import { parseWithSchema } from "./parse";

const choiceSchema = z.object({ value: z.string(), label: z.string() }).catchall(z.unknown());
const stepSchema = z.object({
  id: z.string().optional(),
  code: z.string(),
  title: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  options: z.array(choiceSchema).optional(),
}).catchall(z.unknown());
const pieceSchema = z.object({ code: z.string().optional(), name: z.string().optional(), templateId: z.string().optional() }).catchall(z.unknown());

export const templateConfigSchema = z.object({
  templateType: z.string().optional(),
  orderLineMode: z.string().optional(),
  pieceSelection: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  pieces: z.array(pieceSchema).optional(),
  steps: z.array(stepSchema).optional(),
}).catchall(z.unknown());

const categorySchema = z.string().trim().transform((value) => value || "西服").default("西服");
export const createTemplateSchema = z.object({
  name: z.string().trim().transform((value) => value || "新定制模板").default("新定制模板"),
  category: categorySchema,
  config: templateConfigSchema.default({}),
});
export const saveTemplateSchema = z.object({
  code: z.string().trim().min(1, "模板编码不能为空"),
  name: z.string().trim().min(1, "模板名称不能为空"),
  category: categorySchema,
  config: templateConfigSchema,
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;
export function parseCreateTemplate(value: unknown): CreateTemplateInput { return parseWithSchema(createTemplateSchema, value); }
export function parseSaveTemplate(value: unknown): SaveTemplateInput { return parseWithSchema(saveTemplateSchema, value); }
