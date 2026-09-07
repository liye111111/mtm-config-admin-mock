import type { MeasurementAttribute, MeasurementAttributeRow } from "@/src/domain";
import type { MeasurementAttributeInput, MeasurementAttributeQuery } from "@/src/schemas/measurement-attribute";
import { AppError, NotFoundError } from "@/src/shared/errors";
import * as attributes from "@/src/repositories/measurement-attribute-repository";
import { resolveImages } from "./template-media-service";

async function canonicalInput(request: Request, shopId: string, input: MeasurementAttributeInput): Promise<MeasurementAttributeInput> {
  if (!input.image) return input;
  const [image] = await resolveImages(request, shopId, { ids: [input.image.fileId] });
  return { ...input, image };
}

function view(row: MeasurementAttributeRow): MeasurementAttribute {
  let aliases: string[];
  let image: MeasurementAttribute["image"];
  try { aliases = JSON.parse(row.aliases_json) as string[]; }
  catch { throw new AppError("量体属性别名存储格式无效", 500); }
  try { image = row.image_json ? JSON.parse(row.image_json) as MeasurementAttribute["image"] : undefined; }
  catch { throw new AppError("量体属性图片存储格式无效", 500); }
  return { id: row.id, shopId: row.shop_id, code: row.code, name: row.name, description: row.description || undefined, valueType: row.value_type, dimension: row.dimension, canonicalUnit: row.canonical_unit, precision: row.precision, min: row.min_value, max: row.max_value, step: row.step_value, image, aliases, enabled: row.enabled === 1, referenceCount: Number(row.reference_count ?? 0), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function getMeasurementAttributes(shopId: string, query: MeasurementAttributeQuery) {
  await attributes.ensureDefaultAttributes(shopId);
  return (await attributes.listMeasurementAttributes(shopId, query)).map(view);
}

export async function createMeasurementAttribute(request: Request, shopId: string, rawInput: MeasurementAttributeInput) {
  const input = await canonicalInput(request, shopId, rawInput);
  if (await attributes.findMeasurementAttributeByCode(input.code, shopId)) throw new AppError("量体属性编码已存在", 409);
  const row = await attributes.createMeasurementAttribute(shopId, input);
  if (!row) throw new AppError("量体属性创建失败", 500);
  return view(row);
}

export async function saveMeasurementAttribute(request: Request, shopId: string, id: string, rawInput: MeasurementAttributeInput) {
  const input = await canonicalInput(request, shopId, rawInput);
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
