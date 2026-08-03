import type { StorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import type { AdminCustomerMeasurementProfileInput, ClaimMeasurementProfileInput, MeasurementProfileQuery, SaveMeasurementProfileInput } from "@/src/schemas/storefront";
import { templateView } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import * as profiles from "@/src/repositories/measurement-profile-repository";
import * as templates from "@/src/repositories/template-repository";

const GUEST_PROFILE_DAYS = 180;
const encoder = new TextEncoder();

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
  const fields = templateView(row).config.measurementBlocks.filter((block) => block.enabled).flatMap((block) => block.fields.filter((field) => field.enabled));
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

export async function getCustomerMeasurementProfileForAdmin(id: string) {
  const row = await profiles.findMeasurementProfile(id);
  if (!row) throw new NotFoundError("量体资料不存在");
  return { id: row.id, shopId: row.shop_id, customerId: row.customer_id, ...toView(row, row.customer_id ? "customer" : "guest").profile };
}

export async function createCustomerMeasurementProfileForAdmin(input: AdminCustomerMeasurementProfileInput) {
  if (!input.customerId) throw new AppError("新增资料必须填写客户 ID", 422);
  if (await profiles.findCustomerProfile(input.shopId, input.customerId)) throw new AppError("该客户已有量体资料，请使用编辑功能", 409);
  const row = await profiles.upsertCustomerProfile({ shopId: input.shopId, customerId: input.customerId, unit: input.unit, schemaVersion: input.schemaVersion, measurementsJson: JSON.stringify(input.measurements) });
  if (!row) throw new AppError("客户量体资料创建失败", 500);
  return { id: row.id, shopId: row.shop_id, customerId: row.customer_id, ...toView(row, "customer").profile };
}

export async function updateCustomerMeasurementProfileForAdmin(id: string, input: AdminCustomerMeasurementProfileInput) {
  const existing = await profiles.findMeasurementProfile(id);
  if (!existing) throw new NotFoundError("量体资料不存在");
  if (existing.shop_id !== input.shopId || (existing.customer_id ?? "") !== input.customerId) throw new AppError("不允许变更量体资料的客户归属", 409);
  const row = await profiles.updateMeasurementProfileById(id, { unit: input.unit, schemaVersion: input.schemaVersion, measurementsJson: JSON.stringify(input.measurements) });
  if (!row) throw new AppError("客户量体资料更新失败", 500);
  return { id: row.id, shopId: row.shop_id, customerId: row.customer_id, ...toView(row, row.customer_id ? "customer" : "guest").profile };
}

export async function deleteCustomerMeasurementProfileForAdmin(id: string) {
  const existing = await profiles.findMeasurementProfile(id);
  if (!existing) throw new NotFoundError("量体资料不存在");
  await profiles.deleteMeasurementProfileById(id);
  return { deleted: true };
}
