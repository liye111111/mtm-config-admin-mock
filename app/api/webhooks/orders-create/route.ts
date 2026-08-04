import { authenticateShopifyWebhook } from "@/src/integrations/shopify-webhook";
import { processOrderCreate } from "@/src/services/order-webhook-service";
import { AppError } from "@/src/shared/errors";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const identity = await authenticateShopifyWebhook(request, rawBody);
    if (identity.topic && identity.topic !== "orders/create") throw new AppError("Webhook Topic 无效", 400);
    return Response.json(await processOrderCreate({ ...identity, topic: identity.topic || "orders/create", rawBody }));
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "订单 Webhook 处理失败" }, { status });
  }
}
