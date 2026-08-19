import type { ProductTypeSizeChartBindingRow } from "@/src/domain";
import { database, ensureDatabase } from "./database";

const select = `SELECT b.*,c.name size_chart_name,c.code size_chart_code
FROM product_type_size_chart_bindings b
JOIN size_charts c ON c.id=b.size_chart_id`;

export function normalizeProductType(value: string) { return value.trim().toLocaleLowerCase("zh-CN"); }

export async function listBindings(shopId: string) {
  await ensureDatabase();
  return (await database().prepare(`${select} WHERE b.shop_id=? ORDER BY b.product_type`).bind(shopId).all<ProductTypeSizeChartBindingRow>()).results;
}

export async function findBindingByProductType(shopId: string, productType: string) {
  await ensureDatabase();
  return database().prepare(`${select} WHERE b.shop_id=? AND b.normalized_product_type=?`).bind(shopId, normalizeProductType(productType)).first<ProductTypeSizeChartBindingRow>();
}

export async function createBinding(shopId: string, sizeChartId: string, productType: string) {
  await ensureDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database().prepare("INSERT INTO product_type_size_chart_bindings (id,shop_id,product_type,normalized_product_type,size_chart_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, shopId, productType.trim(), normalizeProductType(productType), sizeChartId, now, now).run();
  return database().prepare(`${select} WHERE b.id=? AND b.shop_id=?`).bind(id, shopId).first<ProductTypeSizeChartBindingRow>();
}

export async function deleteBinding(id: string, shopId: string, sizeChartId: string) {
  await ensureDatabase();
  return database().prepare("DELETE FROM product_type_size_chart_bindings WHERE id=? AND shop_id=? AND size_chart_id=?").bind(id, shopId, sizeChartId).run();
}

