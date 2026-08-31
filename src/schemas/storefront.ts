import { z } from "zod";
import { parseWithSchema } from "./parse";

const requiredId = (message: string) => z.preprocess((value) => value == null ? "" : String(value), z.string().trim().min(1, message));
export const validateConfigurationSchema = z.object({
  schemaVersion: z.literal(3, { error: "配置已更新，请使用 Schema v3 并重新选择" }),
  productId: requiredId("productId 必填"),
  variantId: requiredId("variantId 必填"),
  configVersion: z.coerce.number().int().positive().optional(),
  selections: z.record(z.string(), z.unknown()).default({}),
});

export type ValidateConfigurationInput = z.infer<typeof validateConfigurationSchema>;
export function parseValidateConfiguration(value: unknown): ValidateConfigurationInput { return parseWithSchema(validateConfigurationSchema, value); }

export const createCustomizationSchema = validateConfigurationSchema.extend({ sku: z.string().trim().max(255).optional(), idempotencyKey: z.string().trim().min(8).max(200) });
export type CreateCustomizationInput = z.infer<typeof createCustomizationSchema>;
export function parseCreateCustomization(value: unknown): CreateCustomizationInput { return parseWithSchema(createCustomizationSchema, value); }

const guestIdSchema = z.string().uuid().optional();
export const measurementsSchema = z.record(z.string().trim().min(1).max(100), z.coerce.number().finite()).refine((value) => Object.keys(value).length <= 100, "量体字段过多");
export const measurementProfileQuerySchema = z.object({ productId: requiredId("productId 必填"), guestId: guestIdSchema });
export const saveMeasurementProfileSchema = measurementProfileQuerySchema.extend({ unit: z.enum(["CM", "IN"]), schemaVersion: z.coerce.number().int().positive().default(1), measurements: measurementsSchema });
export const claimMeasurementProfileSchema = z.object({ guestId: z.string().uuid(), strategy: z.enum(["use_guest", "keep_customer"]) });
export type MeasurementProfileQuery = z.infer<typeof measurementProfileQuerySchema>;
export type SaveMeasurementProfileInput = z.infer<typeof saveMeasurementProfileSchema>;
export type ClaimMeasurementProfileInput = z.infer<typeof claimMeasurementProfileSchema>;
export function parseMeasurementProfileQuery(value: unknown): MeasurementProfileQuery { return parseWithSchema(measurementProfileQuerySchema, value); }
export function parseSaveMeasurementProfile(value: unknown): SaveMeasurementProfileInput { return parseWithSchema(saveMeasurementProfileSchema, value); }
export function parseClaimMeasurementProfile(value: unknown): ClaimMeasurementProfileInput { return parseWithSchema(claimMeasurementProfileSchema, value); }

export const sizeRecommendationSchema = z.object({
  productId: requiredId("productId 必填"),
  productType: z.string().trim().max(255, "productType 过长"),
  availableSizes: z.array(z.string().trim().min(1).max(100)).min(1, "没有可推荐的尺码").max(100).transform((values) => [...new Set(values)]),
  measurements: measurementsSchema.refine((value) => Object.keys(value).length > 0, "量体数据不能为空"),
});
export type SizeRecommendationInput = z.infer<typeof sizeRecommendationSchema>;
export function parseSizeRecommendation(value: unknown): SizeRecommendationInput { return parseWithSchema(sizeRecommendationSchema, value); }

export const adminCustomerMeasurementProfileSchema = z.object({
  shopId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/, "shopId 格式无效"),
  customerId: z.preprocess((value) => value == null ? "" : String(value), z.union([z.literal(""), z.string().trim().regex(/^\d+$/, "customerId 必须是 Shopify 数字 ID")])),
  unit: z.enum(["CM", "IN"]),
  schemaVersion: z.coerce.number().int().positive().default(1),
  measurements: measurementsSchema,
});
export type AdminCustomerMeasurementProfileInput = z.infer<typeof adminCustomerMeasurementProfileSchema>;
export function parseAdminCustomerMeasurementProfile(value: unknown): AdminCustomerMeasurementProfileInput { return parseWithSchema(adminCustomerMeasurementProfileSchema, value); }
