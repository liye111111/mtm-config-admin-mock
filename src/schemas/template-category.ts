import { z } from "zod";
import { parseWithSchema } from "./parse";

const code = z.string().trim().min(1, "品类编码不能为空").regex(/^[a-z][a-z0-9_]*$/, "品类编码必须以小写英文字母开头，并且只能包含小写字母、数字和下划线");
export const createTemplateCategorySchema = z.object({ code, name: z.string().trim().min(1, "品类名称不能为空"), sortOrder: z.number().int().nonnegative().default(0) });
export const updateTemplateCategorySchema = z.object({ name: z.string().trim().min(1, "品类名称不能为空"), sortOrder: z.number().int().nonnegative() });
export type CreateTemplateCategoryInput = z.infer<typeof createTemplateCategorySchema>;
export type UpdateTemplateCategoryInput = z.infer<typeof updateTemplateCategorySchema>;
export function parseCreateTemplateCategory(value: unknown) { return parseWithSchema(createTemplateCategorySchema, value); }
export function parseUpdateTemplateCategory(value: unknown) { return parseWithSchema(updateTemplateCategorySchema, value); }
