import type { OrderWebhookSnapshotRow } from "@/src/domain";
import { database, ensureDatabase } from "./database";

export async function findByWebhookId(webhookId: string) { await ensureDatabase(); return database().prepare("SELECT * FROM order_webhook_snapshots WHERE webhook_id=?").bind(webhookId).first<OrderWebhookSnapshotRow>(); }

export async function createSnapshot(args: { shopId: string; webhookId: string; topic: string; orderId: string | null; payloadJson: string }) {
  await ensureDatabase();
  const id = `wh_${crypto.randomUUID().replace(/-/g, "")}`;
  await database().prepare("INSERT INTO order_webhook_snapshots (id,shop_id,webhook_id,topic,shopify_order_id,payload_json,status,error,received_at,processed_at) VALUES (?,?,?,?,?,?,'received',NULL,?,NULL)")
    .bind(id, args.shopId, args.webhookId, args.topic, args.orderId, args.payloadJson, new Date().toISOString()).run();
  return findByWebhookId(args.webhookId);
}

export async function finishSnapshot(webhookId: string, status: "processed" | "failed", error: string | null = null) {
  await ensureDatabase();
  return database().prepare("UPDATE order_webhook_snapshots SET status=?,error=?,processed_at=? WHERE webhook_id=?").bind(status, error, new Date().toISOString(), webhookId).run();
}
