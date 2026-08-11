import { AppError } from "@/src/shared/errors";
import * as customizations from "@/src/repositories/customization-repository";
import * as profiles from "@/src/repositories/measurement-profile-repository";
import * as snapshots from "@/src/repositories/order-webhook-repository";

type OrderProperty = { name?: unknown; key?: unknown; value?: unknown };
type OrderLineItem = { id?: unknown; properties?: unknown };
type OrderPayload = { id?: unknown; admin_graphql_api_id?: unknown; email?: unknown; contact_email?: unknown; customer?: { id?: unknown; email?: unknown; first_name?: unknown; last_name?: unknown } | null; line_items?: unknown };

function optionalText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }

function customizationId(item: OrderLineItem) {
  if (!Array.isArray(item.properties)) return null;
  const property = (item.properties as OrderProperty[]).find((entry) => (entry.name ?? entry.key) === "_mtm_customization_id");
  return typeof property?.value === "string" ? property.value : null;
}

export async function processOrderCreate(args: { shopId: string; webhookId: string; topic: string; rawBody: string }) {
  const duplicate = await snapshots.findByWebhookId(args.webhookId);
  if (duplicate) return { received: true, duplicate: true, status: duplicate.status };
  let order: OrderPayload;
  try { order = JSON.parse(args.rawBody) as OrderPayload; }
  catch { throw new AppError("订单 Webhook JSON 无效", 400); }
  const orderId = String(order.admin_graphql_api_id ?? order.id ?? "") || null;
  await snapshots.createSnapshot({ ...args, orderId, payloadJson: args.rawBody });
  try {
    const customerId = order.customer?.id == null ? null : String(order.customer.id);
    const customerEmail = optionalText(order.customer?.email) ?? optionalText(order.email) ?? optionalText(order.contact_email);
    const customerName = [optionalText(order.customer?.first_name), optionalText(order.customer?.last_name)].filter(Boolean).join(" ") || null;
    const lineItems = Array.isArray(order.line_items) ? order.line_items as OrderLineItem[] : [];
    let reconciled = 0;
    for (const item of lineItems) {
      const id = customizationId(item);
      if (!id) continue;
      const instance = await customizations.findById(args.shopId, id);
      if (!instance) continue;
      const measurements = JSON.parse(instance.measurement_snapshot_json) as Record<string, unknown>;
      if (!measurements || typeof measurements !== "object" || !Object.keys(measurements).length) continue;
      const measurementsJson = JSON.stringify(measurements);
      if (customerId) await profiles.upsertCustomerProfile({ shopId: args.shopId, customerId, customerEmail, customerName, unit: "CM", schemaVersion: instance.schema_version, measurementsJson });
      else if (instance.cart_token_hash) await profiles.upsertGuestProfile({ shopId: args.shopId, guestIdHash: instance.cart_token_hash, unit: "CM", schemaVersion: instance.schema_version, measurementsJson, expiresAt: new Date(Date.now() + 180 * 86400000).toISOString() });
      else continue;
      await customizations.markOrdered(instance.id);
      reconciled += 1;
    }
    await snapshots.finishSnapshot(args.webhookId, "processed");
    return { received: true, duplicate: false, reconciled };
  } catch (error) {
    await snapshots.finishSnapshot(args.webhookId, "failed", error instanceof Error ? error.message : "Webhook 处理失败");
    throw error;
  }
}
