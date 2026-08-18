import { z } from "zod";
import { compatibleMeasurementUnits } from "@/src/domain";
import { parseWithSchema } from "./parse";

const code = z.string().trim().min(1, "属性编码不能为空").max(100).regex(/^[a-z][a-z0-9_]*$/, "属性编码必须以小写英文字母开头，并且只能包含小写字母、数字和下划线");
const dimension = z.enum(["length", "weight", "size_code", "none"]);
const canonicalUnit = z.enum(["MM", "CM", "IN", "KG", "LB", "CHI", "NONE"]);
const aliases = z.array(z.string().trim().min(1).max(100)).max(50).transform((values) => [...new Set(values)]);

export const measurementAttributeInputSchema = z.object({
  code,
  name: z.string().trim().min(1, "属性名称不能为空").max(100),
  description: z.string().trim().max(500).optional(),
  valueType: z.enum(["number", "enum"]),
  dimension,
  canonicalUnit,
  precision: z.coerce.number().int().min(0, "精度不能小于 0").max(6, "精度不能超过 6 位小数"),
  aliases,
  enabled: z.boolean(),
}).superRefine((value, context) => {
  if (!compatibleMeasurementUnits[value.dimension].includes(value.canonicalUnit)) context.addIssue({ code: "custom", path: ["canonicalUnit"], message: "标准单位与物理维度不兼容" });
  if (value.valueType === "enum" && value.dimension !== "size_code" && value.dimension !== "none") context.addIssue({ code: "custom", path: ["valueType"], message: "枚举属性只能使用尺码编码或无维度" });
  if (value.valueType === "enum" && value.precision !== 0) context.addIssue({ code: "custom", path: ["precision"], message: "枚举属性的精度必须为 0" });
});

export const measurementAttributeQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  dimension: z.enum(["all", "length", "weight", "size_code", "none"]).default("all"),
  status: z.enum(["all", "enabled", "disabled"]).default("all"),
});

export type MeasurementAttributeInput = z.infer<typeof measurementAttributeInputSchema>;
export type MeasurementAttributeQuery = z.infer<typeof measurementAttributeQuerySchema>;
export function parseMeasurementAttributeInput(value: unknown) { return parseWithSchema(measurementAttributeInputSchema, value); }
export function parseMeasurementAttributeQuery(url: URL) { return parseWithSchema(measurementAttributeQuerySchema, Object.fromEntries(url.searchParams)); }
