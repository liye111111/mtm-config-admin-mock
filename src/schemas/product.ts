import { z } from "zod";
import { parseWithSchema } from "./parse";

const requiredId = (message: string) => z.preprocess((value) => value == null ? "" : String(value), z.string().trim().min(1, message));
const nullableVersion = z.preprocess((value) => value == null || value === "" ? null : Number(value), z.number().int().nonnegative().nullable());
export const variantOptionMappingSchema = z.object({
  shopifyOptionId: z.string().trim().regex(/^gid:\/\/shopify\/ProductOption\/\d+$/, "Shopify Product Option GID 无效"),
  name: z.string().trim().min(1, "Shopify Option 名称必填"),
  position: z.number().int().positive(),
});
export const variantOptionMappingsSchema = z.record(z.string().trim().regex(/^[a-z][a-z0-9_]*$/), variantOptionMappingSchema).default({});
export const visibleVariantMetafieldsSchema = z.array(z.string().trim().regex(/^[a-zA-Z0-9_$-]+\.[a-zA-Z0-9_-]+$/, "Variant 元字段标识无效")).max(250).transform((items) => [...new Set(items)]).default([]);
export const productBindingSchema = z.object({
  shopifyProductGid: z.string().trim().regex(/^gid:\/\/shopify\/Product\/\d+$/, "Shopify Product GID 无效"),
  productKind: z.enum(["single", "suite"]),
  templateId: requiredId("模板必填"),
  publishedVersion: nullableVersion.default(null),
  enabled: z.boolean().default(true),
  variantOptionMappings: variantOptionMappingsSchema,
  visibleVariantMetafields: visibleVariantMetafieldsSchema,
  mockProduct: z.object({
    title: z.string().trim().min(1), handle: z.string().trim(), imageUrl: z.string().trim().optional(), imageAlt: z.string().trim().optional(),
    status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]), variantCount: z.number().int().nonnegative(), onlineStoreUrl: z.string().trim().optional(), updatedAt: z.string().trim().optional(),
    options: z.array(variantOptionMappingSchema).optional(),
  }).optional(),
});

export type SaveProductBindingInput = z.infer<typeof productBindingSchema>;
export function parseProductBinding(value: unknown): SaveProductBindingInput { return parseWithSchema(productBindingSchema, value); }

export function parseStoredVariantOptionMappings(value: string) {
  try { return variantOptionMappingsSchema.parse(JSON.parse(value)); }
  catch { return {}; }
}
export function parseStoredVisibleVariantMetafields(value: string) {
  try { return visibleVariantMetafieldsSchema.parse(JSON.parse(value)); }
  catch { return []; }
}
