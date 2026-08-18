import type { MeasurementAttribute, MeasurementAttributeRow } from "@/src/domain";
import type { MeasurementAttributeInput, MeasurementAttributeQuery } from "@/src/schemas/measurement-attribute";
import { AppError, NotFoundError } from "@/src/shared/errors";
import * as attributes from "@/src/repositories/measurement-attribute-repository";

function view(row: MeasurementAttributeRow): MeasurementAttribute {
  let aliases: string[];
  try { aliases = JSON.parse(row.aliases_json) as string[]; }
  catch { throw new AppError("量体属性别名存储格式无效", 500); }
  return { id: row.id, shopId: row.shop_id, code: row.code, name: row.name, description: row.description || undefined, valueType: row.value_type, dimension: row.dimension, canonicalUnit: row.canonical_unit, precision: row.precision, aliases, enabled: row.enabled === 1, referenceCount: Number(row.reference_count ?? 0), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function getMeasurementAttributes(shopId: string, query: MeasurementAttributeQuery) {
  await attributes.ensureDefaultAttributes(shopId);
  return (await attributes.listMeasurementAttributes(shopId, query)).map(view);
}

export async function createMeasurementAttribute(shopId: string, input: MeasurementAttributeInput) {
  if (await attributes.findMeasurementAttributeByCode(input.code, shopId)) throw new AppError("量体属性编码已存在", 409);
  const row = await attributes.createMeasurementAttribute(shopId, input);
  if (!row) throw new AppError("量体属性创建失败", 500);
  return view(row);
}

export async function saveMeasurementAttribute(shopId: string, id: string, input: MeasurementAttributeInput) {
  const existing = await attributes.findMeasurementAttribute(id, shopId);
  if (!existing) throw new NotFoundError("量体属性不存在");
  if (input.code !== existing.code) throw new AppError("量体属性编码创建后不能修改", 409);
  const row = await attributes.updateMeasurementAttribute(id, shopId, input);
  if (!row) throw new NotFoundError("量体属性不存在");
  return view(row);
}

export async function removeMeasurementAttribute(shopId: string, id: string) {
  const existing = await attributes.findMeasurementAttribute(id, shopId);
  if (!existing) throw new NotFoundError("量体属性不存在");
  if (Number(existing.reference_count ?? 0) > 0) throw new AppError(`量体属性已被 ${existing.reference_count} 处配置引用，请停用后保留历史数据`, 409);
  await attributes.deleteMeasurementAttribute(id, shopId);
}
