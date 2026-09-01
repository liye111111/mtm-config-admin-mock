import type { MeasurementAttributeRow } from "@/src/domain";
import type { MeasurementAttributeInput, MeasurementAttributeQuery } from "@/src/schemas/measurement-attribute";
import { database, ensureDatabase } from "./database";

const DEFAULT_ATTRIBUTES = [
  { code: "height", name: "身高", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: ["身高"] },
  { code: "weight", name: "体重", dimension: "weight", canonicalUnit: "KG", precision: 1, aliases: ["体重"] },
  { code: "chest", name: "胸围", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: ["胸围"] },
  { code: "waist", name: "腰围", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: ["腰围", "净腰围"] },
  { code: "hip", name: "臀围", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: ["臀围"] },
  { code: "shoulder_width", name: "肩宽", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: ["肩宽"] },
  { code: "sleeve_length", name: "袖长", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: ["袖长"] },
  { code: "inseam", name: "裤内长", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: ["裤内长", "内长"] },
  { code: "neck", name: "领围", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: ["领围"] },
  { code: "foot_length", name: "脚长", dimension: "length", canonicalUnit: "MM", precision: 0, aliases: ["脚长"] },
  { code: "foot_width", name: "脚宽", dimension: "length", canonicalUnit: "MM", precision: 0, aliases: ["脚宽"] },
] as const;

export function defaultMeasurementAttributeId(shopId: string, code: string) { return `measurement:${shopId}:${code}`; }

export async function ensureDefaultAttributes(shopId: string) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await database().batch(DEFAULT_ATTRIBUTES.map((attribute) => database().prepare("INSERT OR IGNORE INTO measurement_attributes (id,shop_id,code,name,description,value_type,dimension,canonical_unit,precision,aliases_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,'number',?,?,?,?,1,?,?)")
    .bind(defaultMeasurementAttributeId(shopId, attribute.code), shopId, attribute.code, attribute.name, null, attribute.dimension, attribute.canonicalUnit, attribute.precision, JSON.stringify(attribute.aliases), now, now)));
}

export async function listMeasurementAttributes(shopId: string, query: MeasurementAttributeQuery) {
  await ensureDatabase();
  const conditions = ["shop_id=?"];
  const bindings: Array<string | number> = [shopId];
  if (query.search) { conditions.push("(LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(aliases_json) LIKE ?)"); const pattern = `%${query.search.toLowerCase()}%`; bindings.push(pattern, pattern, pattern); }
  if (query.dimension !== "all") { conditions.push("dimension=?"); bindings.push(query.dimension); }
  if (query.status !== "all") { conditions.push("enabled=?"); bindings.push(query.status === "enabled" ? 1 : 0); }
  return (await database().prepare(`SELECT measurement_attributes.*, (SELECT COUNT(DISTINCT templates.id) FROM templates, json_tree(templates.config_json) WHERE json_tree.key='attributeId' AND json_tree.value=measurement_attributes.id) reference_count FROM measurement_attributes WHERE ${conditions.join(" AND ")} ORDER BY enabled DESC, dimension, name, created_at`).bind(...bindings).all<MeasurementAttributeRow>()).results;
}

export async function listEnabledMeasurementAttributes(shopId: string) {
  await ensureDefaultAttributes(shopId);
  return (await database().prepare("SELECT * FROM measurement_attributes WHERE shop_id=? AND enabled=1 ORDER BY created_at, code")
    .bind(shopId).all<MeasurementAttributeRow>()).results;
}

export async function findMeasurementAttribute(id: string, shopId: string) {
  await ensureDatabase();
  return database().prepare("SELECT measurement_attributes.*, (SELECT COUNT(DISTINCT templates.id) FROM templates, json_tree(templates.config_json) WHERE json_tree.key='attributeId' AND json_tree.value=measurement_attributes.id) reference_count FROM measurement_attributes WHERE id=? AND shop_id=?").bind(id, shopId).first<MeasurementAttributeRow>();
}

export async function findMeasurementAttributeByCode(code: string, shopId: string) {
  await ensureDatabase();
  return database().prepare("SELECT measurement_attributes.*, (SELECT COUNT(DISTINCT templates.id) FROM templates, json_tree(templates.config_json) WHERE json_tree.key='attributeId' AND json_tree.value=measurement_attributes.id) reference_count FROM measurement_attributes WHERE code=? AND shop_id=?").bind(code, shopId).first<MeasurementAttributeRow>();
}

export async function createMeasurementAttribute(shopId: string, input: MeasurementAttributeInput) {
  await ensureDatabase();
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await database().prepare("INSERT INTO measurement_attributes (id,shop_id,code,name,description,value_type,dimension,canonical_unit,precision,aliases_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, shopId, input.code, input.name, input.description || null, input.valueType, input.dimension, input.canonicalUnit, input.precision, JSON.stringify(input.aliases), input.enabled ? 1 : 0, now, now).run();
  return findMeasurementAttribute(id, shopId);
}

export async function updateMeasurementAttribute(id: string, shopId: string, input: MeasurementAttributeInput) {
  await ensureDatabase();
  await database().prepare("UPDATE measurement_attributes SET name=?,description=?,value_type=?,dimension=?,canonical_unit=?,precision=?,aliases_json=?,enabled=?,updated_at=? WHERE id=? AND shop_id=?")
    .bind(input.name, input.description || null, input.valueType, input.dimension, input.canonicalUnit, input.precision, JSON.stringify(input.aliases), input.enabled ? 1 : 0, new Date().toISOString(), id, shopId).run();
  return findMeasurementAttribute(id, shopId);
}

export async function deleteMeasurementAttribute(id: string, shopId: string) {
  await ensureDatabase();
  await database().prepare("DELETE FROM measurement_attributes WHERE id=? AND shop_id=?").bind(id, shopId).run();
}
