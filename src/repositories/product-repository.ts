import type { ProductBindingRow } from "@/src/domain/models";
import type { SaveProductBindingInput } from "@/src/schemas/product";
import type { ShopifyProductSnapshot } from "@/src/integrations/shopify-admin";
import { database, ensureDatabase } from "./database";

export async function listProductBindings(shopId: string) { await ensureDatabase(); return (await database().prepare("SELECT * FROM product_bindings WHERE shop_id=? ORDER BY updated_at DESC").bind(shopId).all<ProductBindingRow>()).results; }
export async function findProductBinding(id: string, shopId: string) { await ensureDatabase(); return database().prepare("SELECT * FROM product_bindings WHERE id=? AND shop_id=?").bind(id, shopId).first<ProductBindingRow>(); }
export async function findByProduct(shopId: string, gid: string) { await ensureDatabase(); return database().prepare("SELECT * FROM product_bindings WHERE shop_id=? AND shopify_product_gid=?").bind(shopId, gid).first<ProductBindingRow>(); }
export async function createProductBinding(input: SaveProductBindingInput, product: ShopifyProductSnapshot) {
  await ensureDatabase(); const id = crypto.randomUUID(), now = new Date().toISOString();
  await database().prepare("INSERT INTO product_bindings (id,shop_id,shopify_product_gid,shopify_product_id,product_title,product_handle,product_image_url,product_image_alt,product_status,product_kind,variant_count,online_store_url,shopify_admin_url,template_id,published_version,enabled,sync_status,sync_error,shopify_updated_at,last_synced_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, product.shopId, product.gid, product.legacyId, product.title, product.handle, product.imageUrl ?? null, product.imageAlt ?? null, product.status, input.productKind, product.variantCount, product.onlineStoreUrl ?? null, product.adminUrl, input.templateId, input.publishedVersion, input.enabled ? 1 : 0, "synced", null, product.updatedAt ?? null, now, now, now).run();
  const row = await findProductBinding(id, product.shopId); if (!row) throw new Error("Created binding not found"); return row;
}
export async function updateProductBinding(id: string, input: SaveProductBindingInput, product: ShopifyProductSnapshot) {
  await ensureDatabase(); const now = new Date().toISOString();
  await database().prepare("UPDATE product_bindings SET shopify_product_gid=?,shopify_product_id=?,product_title=?,product_handle=?,product_image_url=?,product_image_alt=?,product_status=?,product_kind=?,variant_count=?,online_store_url=?,shopify_admin_url=?,template_id=?,published_version=?,enabled=?,sync_status='synced',sync_error=NULL,shopify_updated_at=?,last_synced_at=?,updated_at=? WHERE id=? AND shop_id=?")
    .bind(product.gid, product.legacyId, product.title, product.handle, product.imageUrl ?? null, product.imageAlt ?? null, product.status, input.productKind, product.variantCount, product.onlineStoreUrl ?? null, product.adminUrl, input.templateId, input.publishedVersion, input.enabled ? 1 : 0, product.updatedAt ?? null, now, now, id, product.shopId).run();
  return findProductBinding(id, product.shopId);
}
export async function deleteProductBinding(id: string, shopId: string) { await ensureDatabase(); await database().prepare("DELETE FROM product_bindings WHERE id=? AND shop_id=?").bind(id, shopId).run(); }
