import type { StorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import type { AccountMeasurementProfileInput, AdminCustomerMeasurementProfileInput, ClaimMeasurementProfileInput, MeasurementProfileQuery, SaveMeasurementProfileInput } from "@/src/schemas/storefront";
import { templateView } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import * as profiles from "@/src/repositories/measurement-profile-repository";
import * as templates from "@/src/repositories/template-repository";
import * as attributes from "@/src/repositories/measurement-attribute-repository";
import { resolveMeasurementMetadata } from "./measurement-config-service";

const GUEST_PROFILE_DAYS = 180;
const encoder = new TextEncoder();

function requireCustomer(identity: StorefrontIdentity) {
  if (!identity.customerId) throw new AppError("请先登录后管理量体资料", 401);
  return identity.customerId;
}

function decimalPlaces(value: number) {
  const text = value.toString().toLowerCase();
  if (!text.includes("e")) return (text.split(".")[1] || "").length;
  const [coefficient, exponentText] = text.split("e");
  const decimals = (coefficient.split(".")[1] || "").length;
  return Math.max(0, decimals - Number(exponentText));
}

async function hashGuestId(guestId: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(guestId)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireGuestId(guestId?: string) {
  if (!guestId) throw new AppError("guestId 必填", 400);
  return guestId;
}

function toView(row: Awaited<ReturnType<typeof profiles.findCustomerProfile>>, ownerType: "customer" | "guest") {
  if (!row) return { exists: false as const, ownerType, profile: null };
  let measurements: Record<string, number>;
  try { measurements = JSON.parse(row.measurements_json) as Record<string, number>; }
  catch { throw new AppError("量体资料存储格式无效", 500); }
  return { exists: true as const, ownerType, profile: { unit: row.unit, schemaVersion: row.schema_version, measurements, updatedAt: row.updated_at } };
}

async function validateMeasurements(shopId: string, input: SaveMeasurementProfileInput) {
  const row = await templates.findPublishedTemplateForProduct(shopId, input.productId);
  if (!row) throw new NotFoundError("商品没有已发布的定制配置");
  const config = await resolveMeasurementMetadata(shopId, templateView(row).config);
  const childConfigs = config.templateType === "composite"
    ? await Promise.all(config.components.filter((component) => component.customizationEnabled && component.childTemplateId).map(async (component) => {
      const child = await templates.findPublishedTemplate(component.childTemplateId!);
      return child ? resolveMeasurementMetadata(shopId, templateView(child).config) : null;
    }))
    : [];
  const fields = [config, ...childConfigs.filter((child) => child !== null)]
    .filter((template) => template.steps.some((step) => step.enabled && step.type === "measurements"))
    .flatMap((template) => template.measurementBlocks.filter((block) => block.enabled).flatMap((block) => block.fields.filter((field) => field.enabled)));
  const allowed = new Map(fields.map((field) => [field.code, field]));
  for (const key of Object.keys(input.measurements)) if (!allowed.has(key)) throw new AppError(`包含未知量体字段：${key}`, 422);
  for (const field of fields) {
    const value = input.measurements[field.code];
    if (field.required && value === undefined) throw new AppError(`请填写${field.name}`, 422);
    if (value === undefined) continue;
    if (value < field.min || value > field.max) throw new AppError(`${field.name}必须在 ${field.min}-${field.max} ${field.standardUnit} 之间`, 422);
    const steps = Math.abs((value - field.min) / field.step);
    if (field.step > 0 && Math.abs(steps - Math.round(steps)) > 1e-7) throw new AppError(`${field.name}必须按 ${field.step} ${field.standardUnit} 递增`, 422);
  }
}

export async function getMeasurementProfile(identity: StorefrontIdentity, input: MeasurementProfileQuery) {
  if (identity.customerId) return toView(await profiles.findCustomerProfile(identity.shopId, identity.customerId), "customer");
  return toView(await profiles.findGuestProfile(identity.shopId, await hashGuestId(requireGuestId(input.guestId))), "guest");
}

export async function saveMeasurementProfile(identity: StorefrontIdentity, input: SaveMeasurementProfileInput) {
  await validateMeasurements(identity.shopId, input);
  const measurementsJson = JSON.stringify(input.measurements);
  const row = identity.customerId
    ? await profiles.upsertCustomerProfile({ shopId: identity.shopId, customerId: identity.customerId, unit: input.unit, schemaVersion: input.schemaVersion, measurementsJson })
    : await profiles.upsertGuestProfile({ shopId: identity.shopId, guestIdHash: await hashGuestId(requireGuestId(input.guestId)), unit: input.unit, schemaVersion: input.schemaVersion, measurementsJson, expiresAt: new Date(Date.now() + GUEST_PROFILE_DAYS * 86400000).toISOString() });
  if (!row) throw new AppError("量体资料保存失败", 500);
  return toView(row, identity.customerId ? "customer" : "guest");
}

export async function deleteMeasurementProfile(identity: StorefrontIdentity, input: MeasurementProfileQuery) {
  if (identity.customerId) await profiles.deleteCustomerProfile(identity.shopId, identity.customerId);
  else await profiles.deleteGuestProfile(identity.shopId, await hashGuestId(requireGuestId(input.guestId)));
  return { deleted: true };
}

export async function getAccountMeasurementFields(identity: StorefrontIdentity) {
  requireCustomer(identity);
  const rows = await attributes.listEnabledMeasurementAttributes(identity.shopId);
  return {
    schemaVersion: 1 as const,
    fields: rows.map((row, sortOrder) => ({
      code: row.code,
      name: row.name,
      description: row.description,
      valueType: row.value_type,
      dimension: row.dimension,
      canonicalUnit: row.canonical_unit,
      precision: row.precision,
      sortOrder,
    })),
  };
}

export async function getAccountMeasurementProfile(identity: StorefrontIdentity) {
  const customerId = requireCustomer(identity);
  return toView(await profiles.findCustomerProfile(identity.shopId, customerId), "customer");
}

export async function saveAccountMeasurementProfile(identity: StorefrontIdentity, input: AccountMeasurementProfileInput) {
  const customerId = requireCustomer(identity);
  const rows = await attributes.listEnabledMeasurementAttributes(identity.shopId);
  const allowed = new Map(rows.map((row) => [row.code, row]));
  for (const [code, value] of Object.entries(input.measurements)) {
    const attribute = allowed.get(code);
    if (!attribute) throw new AppError(`包含未知或已停用的量体字段：${code}`, 422);
    if (attribute.value_type !== "number") throw new AppError(`${attribute.name}暂不支持数值录入`, 422);
    if (value <= 0) throw new AppError(`${attribute.name}必须大于 0`, 422);
    if (decimalPlaces(value) > attribute.precision) throw new AppError(`${attribute.name}最多保留 ${attribute.precision} 位小数`, 422);
  }
  const row = await profiles.upsertCustomerProfile({
    shopId: identity.shopId,
    customerId,
    unit: input.unit,
    schemaVersion: input.schemaVersion,
    measurementsJson: JSON.stringify(input.measurements),
  });
  if (!row) throw new AppError("量体资料保存失败", 500);
  return toView(row, "customer");
}

export async function deleteAccountMeasurementProfile(identity: StorefrontIdentity) {
  await profiles.deleteCustomerProfile(identity.shopId, requireCustomer(identity));
  return { deleted: true };
}

export async function getClaimStatus(identity: StorefrontIdentity, guestId: string) {
  if (!identity.customerId) throw new AppError("请先登录", 401);
  const [customer, guest] = await Promise.all([profiles.findCustomerProfile(identity.shopId, identity.customerId), profiles.findGuestProfile(identity.shopId, await hashGuestId(guestId))]);
  return { customerExists: Boolean(customer), guestExists: Boolean(guest), conflict: Boolean(customer && guest) };
}

export async function claimGuestProfile(identity: StorefrontIdentity, input: ClaimMeasurementProfileInput) {
  if (!identity.customerId) throw new AppError("请先登录", 401);
  const guestHash = await hashGuestId(input.guestId);
  const guest = await profiles.findGuestProfile(identity.shopId, guestHash);
  if (!guest) return { claimed: false, reason: "guest_profile_not_found" as const };
  if (input.strategy === "keep_customer") {
    await profiles.deleteGuestProfile(identity.shopId, guestHash);
    return { claimed: false, reason: "customer_profile_kept" as const };
  }
  const row = await profiles.replaceCustomerWithGuest(identity.shopId, identity.customerId, guest);
  if (!row) throw new AppError("匿名量体资料迁移失败", 500);
  return { claimed: true, profile: toView(row, "customer") };
}

export async function getCustomerMeasurementProfileForAdmin(shopId: string, id: string) {
  const row = await profiles.findMeasurementProfile(id, shopId);
  if (!row) throw new NotFoundError("量体资料不存在");
  return { id: row.id, shopId: row.shop_id, customerId: row.customer_id, customerEmail: row.customer_email, customerName: row.customer_name, ...toView(row, row.customer_id ? "customer" : "guest").profile };
}

export async function createCustomerMeasurementProfileForAdmin(shopId: string, input: AdminCustomerMeasurementProfileInput) {
  if (input.shopId !== shopId) throw new AppError("不允许为其他店铺创建量体资料", 403);
  if (!input.customerId) throw new AppError("新增资料必须填写客户 ID", 422);
  if (await profiles.findCustomerProfile(input.shopId, input.customerId)) throw new AppError("该客户已有量体资料，请使用编辑功能", 409);
  const row = await profiles.upsertCustomerProfile({ shopId: input.shopId, customerId: input.customerId, unit: input.unit, schemaVersion: input.schemaVersion, measurementsJson: JSON.stringify(input.measurements) });
  if (!row) throw new AppError("客户量体资料创建失败", 500);
  return { id: row.id, shopId: row.shop_id, customerId: row.customer_id, customerEmail: row.customer_email, customerName: row.customer_name, ...toView(row, "customer").profile };
}

export async function updateCustomerMeasurementProfileForAdmin(shopId: string, id: string, input: AdminCustomerMeasurementProfileInput) {
  if (input.shopId !== shopId) throw new AppError("不允许修改其他店铺的量体资料", 403);
  const existing = await profiles.findMeasurementProfile(id, shopId);
  if (!existing) throw new NotFoundError("量体资料不存在");
  if (existing.shop_id !== input.shopId || (existing.customer_id ?? "") !== input.customerId) throw new AppError("不允许变更量体资料的客户归属", 409);
  const row = await profiles.updateMeasurementProfileById(id, shopId, { unit: input.unit, schemaVersion: input.schemaVersion, measurementsJson: JSON.stringify(input.measurements) });
  if (!row) throw new AppError("客户量体资料更新失败", 500);
  return { id: row.id, shopId: row.shop_id, customerId: row.customer_id, customerEmail: row.customer_email, customerName: row.customer_name, ...toView(row, row.customer_id ? "customer" : "guest").profile };
}

export async function deleteCustomerMeasurementProfileForAdmin(shopId: string, id: string) {
  const existing = await profiles.findMeasurementProfile(id, shopId);
  if (!existing) throw new NotFoundError("量体资料不存在");
  await profiles.deleteMeasurementProfileById(id, shopId);
  return { deleted: true };
}
