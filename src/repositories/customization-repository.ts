import type { CustomizationInstanceRow } from "@/src/domain";
import type { CreateCustomizationInput } from "@/src/schemas/storefront";
import { database, ensureDatabase } from "./database";

export async function findByIdempotencyKey(shopId: string, key: string) { await ensureDatabase(); return database().prepare("SELECT * FROM customization_instances WHERE shop_id=? AND idempotency_key=?").bind(shopId, key).first<CustomizationInstanceRow>(); }

export async function createCustomizationInstance(args: { shopId: string; input: CreateCustomizationInput; templateId: string; templateCode: string; templateVersion: number; schemaVersion: number; summary: string }) {
  await ensureDatabase(); const id = `cust_${crypto.randomUUID().replace(/-/g, "")}`, now = new Date().toISOString();
  const components = typeof args.input.selections.components === "object" && args.input.selections.components ? args.input.selections.components : {};
  const measurements = typeof args.input.selections.measurements === "object" && args.input.selections.measurements ? args.input.selections.measurements : {};
  await database().prepare(`INSERT INTO customization_instances (id,shop_id,shopify_product_id,shopify_variant_id,shopify_sku,template_id,template_code,template_version,schema_version,status,selection_snapshot_json,component_snapshot_json,measurement_snapshot_json,summary,idempotency_key,customer_id,cart_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'validated',?,?,?,?,?,?,NULL,?,?)`)
    .bind(id,args.shopId,args.input.productId,args.input.variantId,args.input.sku||null,args.templateId,args.templateCode,args.templateVersion,args.schemaVersion,JSON.stringify(args.input.selections),JSON.stringify(components),JSON.stringify(measurements),args.summary,args.input.idempotencyKey,args.input.customerId||null,now,now).run();
  return database().prepare("SELECT * FROM customization_instances WHERE id=?").bind(id).first<CustomizationInstanceRow>();
}
