import { z } from "zod";
import { parseWithSchema } from "./parse";

const requiredId = (message: string) => z.preprocess((value) => value == null ? "" : String(value), z.string().trim().min(1, message));
const nullableVersion = z.preprocess((value) => value == null || value === "" ? null : Number(value), z.number().int().nonnegative().nullable());
export const productBindingSchema = z.object({
  shopifyProductId: requiredId("商品 ID 必填"),
  productTitle: z.string().trim().min(1, "商品标题必填"),
  productHandle: z.string().trim().default(""),
  templateId: requiredId("模板必填"),
  publishedVersion: nullableVersion.default(null),
});

export type SaveProductBindingInput = z.infer<typeof productBindingSchema>;
export function parseProductBinding(value: unknown): SaveProductBindingInput { return parseWithSchema(productBindingSchema, value); }
