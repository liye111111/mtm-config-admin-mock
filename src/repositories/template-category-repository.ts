import type { TemplateCategoryRow } from "@/src/domain";
import { database, ensureDatabase } from "./database";

const select = `SELECT c.*, COUNT(t.id) template_count FROM template_categories c LEFT JOIN templates t ON t.category=c.code`;
export async function listCategories() { await ensureDatabase(); return (await database().prepare(`${select} GROUP BY c.id ORDER BY c.sort_order,c.created_at`).all<TemplateCategoryRow>()).results; }
export async function findCategory(id: string) { await ensureDatabase(); return database().prepare(`${select} WHERE c.id=? GROUP BY c.id`).bind(id).first<TemplateCategoryRow>(); }
export async function findCategoryByCode(code: string) { await ensureDatabase(); return database().prepare("SELECT * FROM template_categories WHERE code=?").bind(code).first<TemplateCategoryRow>(); }
export async function createCategory(input: { code: string; name: string; sortOrder: number }) { const id=crypto.randomUUID(),now=new Date().toISOString(); await ensureDatabase(); await database().prepare("INSERT INTO template_categories (id,code,name,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(id,input.code,input.name,input.sortOrder,now,now).run(); return (await findCategory(id))!; }
export async function updateCategory(id: string, input: { name: string; sortOrder: number }) { await ensureDatabase(); await database().prepare("UPDATE template_categories SET name=?,sort_order=?,updated_at=? WHERE id=?").bind(input.name,input.sortOrder,new Date().toISOString(),id).run(); return findCategory(id); }
export async function deleteCategory(id: string) { await ensureDatabase(); await database().prepare("DELETE FROM template_categories WHERE id=?").bind(id).run(); }
