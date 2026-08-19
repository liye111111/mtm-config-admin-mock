import { z } from "zod";
import { parseWithSchema } from "./parse";

const chartCode = z.string().trim().min(1, "尺码表编码不能为空").max(100).regex(/^[a-z][a-z0-9_]*$/, "编码只能包含小写字母、数字和下划线，且必须以字母开头");
const attributeCode = z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/);
const sizeCode = z.string().trim().max(100);
const finite = z.number().finite();

const inputAttributeSchema = z.object({ attributeCode, required: z.boolean(), weight: z.number().positive().finite().optional() });
const sizeSchema = z.object({ code: sizeCode, label: z.string().trim().max(100), sortOrder: z.number().int().min(0) });
const rangeSchema = z.object({ min: finite, max: finite }).refine((value) => value.min <= value.max, "区间最小值不能大于最大值");
const configBase = { schemaVersion: z.literal(1), inputAttributes: z.array(inputAttributeSchema).max(20), sizes: z.array(sizeSchema).max(100) };

const rangeMatrixSchema = z.object({
  ...configBase,
  algorithm: z.object({ code: z.literal("range_matrix"), version: z.literal(1) }),
  data: z.object({ rows: z.array(z.object({ id: z.string().min(1), ranges: z.record(attributeCode, rangeSchema), sizeCode })).max(1000) }),
});
const nearestProfileSchema = z.object({
  ...configBase,
  algorithm: z.object({ code: z.literal("nearest_profile"), version: z.literal(1) }),
  data: z.object({ profiles: z.array(z.object({ sizeCode, measurements: z.record(attributeCode, finite) })).max(100), maxDistance: z.number().positive().finite() }),
});
const directLookupSchema = z.object({
  ...configBase,
  algorithm: z.object({ code: z.literal("direct_lookup"), version: z.literal(1) }),
  data: z.object({ attributeCode: z.string().trim().max(100), mappings: z.array(z.object({ min: finite, max: finite, sizeCode }).refine((value) => value.min <= value.max, "区间最小值不能大于最大值")).max(1000) }),
});

export const sizeChartConfigSchema = z.union([rangeMatrixSchema, nearestProfileSchema, directLookupSchema]);

// Zod cannot discriminate on a nested object, so select the schema explicitly.
function parseConfig(value: unknown) {
  const code = typeof value === "object" && value !== null && "algorithm" in value && typeof value.algorithm === "object" && value.algorithm !== null && "code" in value.algorithm ? value.algorithm.code : undefined;
  if (code === "range_matrix") return parseWithSchema(rangeMatrixSchema, value);
  if (code === "nearest_profile") return parseWithSchema(nearestProfileSchema, value);
  if (code === "direct_lookup") return parseWithSchema(directLookupSchema, value);
  return parseWithSchema(rangeMatrixSchema, value);
}

export const createSizeChartSchema = z.object({ code: chartCode, name: z.string().trim().min(1, "尺码表名称不能为空").max(100), description: z.string().trim().max(500).optional() });
export const updateSizeChartSchema = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional(), status: z.enum(["active", "disabled"]), config: z.unknown() });

export type CreateSizeChartInput = z.infer<typeof createSizeChartSchema>;
export type UpdateSizeChartInput = Omit<z.infer<typeof updateSizeChartSchema>, "config"> & { config: ReturnType<typeof parseConfig> };
export function parseCreateSizeChart(value: unknown) { return parseWithSchema(createSizeChartSchema, value); }
export function parseUpdateSizeChart(value: unknown): UpdateSizeChartInput { const base = parseWithSchema(updateSizeChartSchema, value); return { ...base, config: parseConfig(base.config) }; }
export function parseSizeChartConfig(value: unknown) { return parseConfig(value); }
