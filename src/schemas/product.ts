import { z } from "zod";
import { parseWithSchema } from "./parse";

const requiredId = (message: string) => z.preprocess((value) => value == null ? "" : String(value), z.string().trim().min(1, message));
const nullableVersion = z.preprocess((value) => value == null || value === "" ? null : Number(value), z.number().int().nonnegative().nullable());
export const productBindingSchema = z.object({
  shopifyProductGid: z.string().trim().regex(/^gid:\/\/shopify\/Product\/\d+$/, "Shopify Product GID 无效"),
  productKind: z.enum(["single", "suite"]),
  templateId: requiredId("模板必填"),
  publishedVersion: nullableVersion.default(null),
  enabled: z.boolean().default(true),
  mockProduct: z.object({
    title: z.string().trim().min(1), handle: z.string().trim(), imageUrl: z.string().trim().optional(), imageAlt: z.string().trim().optional(),
    status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]), variantCount: z.number().int().nonnegative(), onlineStoreUrl: z.string().trim().optional(), updatedAt: z.string().trim().optional(),
  }).optional(),
});

export type SaveProductBindingInput = z.infer<typeof productBindingSchema>;
export function parseProductBinding(value: unknown): SaveProductBindingInput { return parseWithSchema(productBindingSchema, value); }
