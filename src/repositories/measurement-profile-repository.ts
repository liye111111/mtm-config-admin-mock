import type { MeasurementProfileRow } from "@/src/domain";
import { database, ensureDatabase } from "./database";

export async function findCustomerProfile(shopId: string, customerId: string) {
  await ensureDatabase();
  return database().prepare("SELECT * FROM measurement_profiles WHERE shop_id=? AND customer_id=?").bind(shopId, customerId).first<MeasurementProfileRow>();
}

export async function findGuestProfile(shopId: string, guestIdHash: string) {
  await ensureDatabase();
  return database().prepare("SELECT * FROM measurement_profiles WHERE shop_id=? AND guest_id_hash=? AND expires_at>?").bind(shopId, guestIdHash, new Date().toISOString()).first<MeasurementProfileRow>();
}

export type MeasurementProfileFilter = "all" | "customer" | "guest" | "activeGuest";

export async function listMeasurementProfiles(shopId: string, options: { filter: MeasurementProfileFilter; page: number; pageSize: number }) {
  await ensureDatabase();
  const now = new Date().toISOString();
  const stats = await database().prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END) customer_count,
    SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) guest_count,
    SUM(CASE WHEN customer_id IS NULL AND expires_at>? THEN 1 ELSE 0 END) active_guest_count
    FROM measurement_profiles WHERE shop_id=?`).bind(now, shopId).first<{ total: number; customer_count: number | null; guest_count: number | null; active_guest_count: number | null }>();
  const counts = { total: stats?.total ?? 0, customer: stats?.customer_count ?? 0, guest: stats?.guest_count ?? 0, activeGuest: stats?.active_guest_count ?? 0 };
  const total = options.filter === "all" ? counts.total : counts[options.filter];
  const totalPages = Math.max(1, Math.ceil(total / options.pageSize));
  const page = Math.min(options.page, totalPages);
  const filterSql = options.filter === "customer" ? " AND customer_id IS NOT NULL" : options.filter === "guest" ? " AND customer_id IS NULL" : options.filter === "activeGuest" ? " AND customer_id IS NULL AND expires_at>?" : "";
  const statement = database().prepare(`SELECT * FROM measurement_profiles WHERE shop_id=?${filterSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`);
  const query = options.filter === "activeGuest" ? statement.bind(shopId, now, options.pageSize, (page - 1) * options.pageSize) : statement.bind(shopId, options.pageSize, (page - 1) * options.pageSize);
  const items = (await query.all<MeasurementProfileRow>()).results;
  return { items, total, page, pageSize: options.pageSize, totalPages, stats: counts };
}

export async function findMeasurementProfile(id: string, shopId: string) {
  await ensureDatabase();
  return database().prepare("SELECT * FROM measurement_profiles WHERE id=? AND shop_id=?").bind(id, shopId).first<MeasurementProfileRow>();
}

export async function updateMeasurementProfileById(id: string, shopId: string, args: { unit: "CM" | "IN"; schemaVersion: number; measurementsJson: string }) {
  await ensureDatabase();
  await database().prepare("UPDATE measurement_profiles SET unit=?,schema_version=?,measurements_json=?,updated_at=? WHERE id=? AND shop_id=?")
    .bind(args.unit, args.schemaVersion, args.measurementsJson, new Date().toISOString(), id, shopId).run();
  return findMeasurementProfile(id, shopId);
}

export async function upsertCustomerProfile(args: { shopId: string; customerId: string; customerEmail?: string | null; customerName?: string | null; unit: "CM" | "IN"; schemaVersion: number; measurementsJson: string }) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO measurement_profiles (id,shop_id,customer_id,customer_email,customer_name,guest_id_hash,unit,schema_version,measurements_json,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,?,NULL,?,?,?,NULL,?,?)
    ON CONFLICT(shop_id,customer_id) DO UPDATE SET customer_email=COALESCE(excluded.customer_email,measurement_profiles.customer_email),customer_name=COALESCE(excluded.customer_name,measurement_profiles.customer_name),unit=excluded.unit,schema_version=excluded.schema_version,measurements_json=excluded.measurements_json,expires_at=NULL,updated_at=excluded.updated_at`)
    .bind(`mp_${crypto.randomUUID().replace(/-/g, "")}`, args.shopId, args.customerId, args.customerEmail ?? null, args.customerName ?? null, args.unit, args.schemaVersion, args.measurementsJson, now, now).run();
  return findCustomerProfile(args.shopId, args.customerId);
}

export async function upsertGuestProfile(args: { shopId: string; guestIdHash: string; unit: "CM" | "IN"; schemaVersion: number; measurementsJson: string; expiresAt: string }) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO measurement_profiles (id,shop_id,customer_id,guest_id_hash,unit,schema_version,measurements_json,expires_at,created_at,updated_at)
    VALUES (?,?,NULL,?,?,?,?,?,?,?)
    ON CONFLICT(shop_id,guest_id_hash) DO UPDATE SET unit=excluded.unit,schema_version=excluded.schema_version,measurements_json=excluded.measurements_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
    .bind(`mp_${crypto.randomUUID().replace(/-/g, "")}`, args.shopId, args.guestIdHash, args.unit, args.schemaVersion, args.measurementsJson, args.expiresAt, now, now).run();
  return findGuestProfile(args.shopId, args.guestIdHash);
}

export async function deleteCustomerProfile(shopId: string, customerId: string) {
  await ensureDatabase();
  return database().prepare("DELETE FROM measurement_profiles WHERE shop_id=? AND customer_id=?").bind(shopId, customerId).run();
}

export async function deleteMeasurementProfileById(id: string, shopId: string) {
  await ensureDatabase();
  return database().prepare("DELETE FROM measurement_profiles WHERE id=? AND shop_id=?").bind(id, shopId).run();
}

export async function deleteGuestProfile(shopId: string, guestIdHash: string) {
  await ensureDatabase();
  return database().prepare("DELETE FROM measurement_profiles WHERE shop_id=? AND guest_id_hash=?").bind(shopId, guestIdHash).run();
}

export async function replaceCustomerWithGuest(shopId: string, customerId: string, guest: MeasurementProfileRow) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await database().batch([
    database().prepare("DELETE FROM measurement_profiles WHERE shop_id=? AND customer_id=?").bind(shopId, customerId),
    database().prepare("UPDATE measurement_profiles SET customer_id=?,guest_id_hash=NULL,expires_at=NULL,updated_at=? WHERE id=? AND shop_id=?").bind(customerId, now, guest.id, shopId),
  ]);
  return findCustomerProfile(shopId, customerId);
}

export async function deleteExpiredGuestProfiles() {
  await ensureDatabase();
  return database().prepare("DELETE FROM measurement_profiles WHERE customer_id IS NULL AND expires_at<=?").bind(new Date().toISOString()).run();
}
