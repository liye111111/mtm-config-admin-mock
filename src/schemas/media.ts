import { z } from "zod";
import { parseWithSchema } from "./parse";

export const fileIdSchema = z.string().regex(/^gid:\/\/shopify\/MediaImage\/\d+$/, "请选择 Shopify 图片文件");
export const imageReferenceSchema = z.object({
  fileId: fileIdSchema,
  url: z.string().url().refine((value) => new URL(value).protocol === "https:", "图片地址必须使用 HTTPS"),
  alt: z.string().max(1000).default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
}).strict();

export const resolveFilesSchema = z.object({ ids: z.array(fileIdSchema).min(1).max(50) }).strict();
export function parseResolveFiles(value: unknown) { return parseWithSchema(resolveFilesSchema, value); }
