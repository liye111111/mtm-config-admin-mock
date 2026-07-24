import type { ProductBindingRow } from "@/src/domain/models";
import type { SaveProductBindingInput } from "@/src/schemas/product";
import { database, ensureDatabase } from "./database";

export async function listProductBindings() { await ensureDatabase(); return (await database().prepare("SELECT * FROM product_bindings ORDER BY updated_at DESC").all<ProductBindingRow>()).results; }
export async function findProductBinding(id: string) { await ensureDatabase(); return database().prepare("SELECT * FROM product_bindings WHERE id=?").bind(id).first<ProductBindingRow>(); }
export async function createProductBinding(input: SaveProductBindingInput) {
  await ensureDatabase(); const id = crypto.randomUUID(), now = new Date().toISOString();
  await database().prepare("INSERT INTO product_bindings (id,shopify_product_id,product_title,product_handle,template_id,published_version,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, input.shopifyProductId, input.productTitle, input.productHandle, input.templateId, input.publishedVersion, input.enabled ? 1 : 0, now, now).run();
  return (await findProductBinding(id))!;
}
export async function updateProductBinding(id: string, input: SaveProductBindingInput) {
  await ensureDatabase(); await database().prepare("UPDATE product_bindings SET shopify_product_id=?,product_title=?,product_handle=?,template_id=?,published_version=?,enabled=?,updated_at=? WHERE id=?").bind(input.shopifyProductId, input.productTitle, input.productHandle, input.templateId, input.publishedVersion, input.enabled ? 1 : 0, new Date().toISOString(), id).run();
  return findProductBinding(id);
}
export async function deleteProductBinding(id: string) { await ensureDatabase(); await database().prepare("DELETE FROM product_bindings WHERE id=?").bind(id).run(); }
