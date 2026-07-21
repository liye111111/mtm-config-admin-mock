import type { SaveTemplateInput } from "@/src/schemas/template";
import type { TemplateConfig, TemplateRow } from "@/src/domain/models";
import { database, ensureDatabase } from "./database";

export async function listTemplates() { await ensureDatabase(); return (await database().prepare("SELECT * FROM templates ORDER BY updated_at DESC").all<TemplateRow>()).results; }
export async function findTemplate(id: string) { await ensureDatabase(); return database().prepare("SELECT * FROM templates WHERE id=?").bind(id).first<TemplateRow>(); }
export async function findPublishedTemplate(id: string) { await ensureDatabase(); return database().prepare("SELECT * FROM templates WHERE id=? AND status='published'").bind(id).first<TemplateRow>(); }
export async function findPublishedTemplateForProduct(productId: string) { await ensureDatabase(); return database().prepare("SELECT t.* FROM templates t JOIN product_bindings p ON p.template_id=t.id WHERE p.shopify_product_id=? AND t.status='published'").bind(productId).first<TemplateRow>(); }
export async function createTemplate(input: { name: string; category: string; config: TemplateConfig }) {
  await ensureDatabase(); const id = crypto.randomUUID(), now = new Date().toISOString(), code = `template_${Date.now()}`;
  await database().prepare("INSERT INTO templates (id,code,name,category,status,version,config_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, code, input.name, input.category, "draft", 1, JSON.stringify(input.config), now, now).run();
  return (await findTemplate(id))!;
}
export async function updateTemplate(id: string, input: SaveTemplateInput) {
  await ensureDatabase();
  await database().prepare("UPDATE templates SET code=?,name=?,category=?,status='draft',config_json=?,updated_at=? WHERE id=?").bind(input.code, input.name, input.category, JSON.stringify(input.config), new Date().toISOString(), id).run();
  return findTemplate(id);
}
export async function publishTemplate(id: string, input: SaveTemplateInput, current: TemplateRow) {
  const version = current.version + 1, now = new Date().toISOString(), json = JSON.stringify(input.config), db = database();
  await db.batch([
    db.prepare("UPDATE templates SET code=?,name=?,category=?,status='published',version=?,config_json=?,updated_at=? WHERE id=?").bind(input.code, input.name, input.category, version, json, now, id),
    db.prepare("INSERT INTO template_versions (id,template_id,version,config_json,published_at) VALUES (?,?,?,?,?)").bind(`${id}-v${version}`, id, version, json, now),
  ]);
  return (await findTemplate(id))!;
}
export async function deleteTemplate(id: string) {
  const db = database(); await db.batch([db.prepare("DELETE FROM product_bindings WHERE template_id=?").bind(id), db.prepare("DELETE FROM template_versions WHERE template_id=?").bind(id), db.prepare("DELETE FROM templates WHERE id=?").bind(id)]);
}
export async function listTemplateVersions(id: string) { await ensureDatabase(); return (await database().prepare("SELECT id,template_id,version,config_json,published_at FROM template_versions WHERE template_id=? ORDER BY version DESC").bind(id).all()).results; }
