import { optionsResponse, storefrontCors } from "@/src/middleware/http";
import { AppError } from "@/src/shared/errors";
import { authenticateStorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import { parseCreateCustomization } from "@/src/schemas/storefront";
import { createCustomization } from "@/src/services/storefront-service";

export async function OPTIONS() { return optionsResponse(); }
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const idempotencyKey = request.headers.get("Idempotency-Key") || body.idempotencyKey;
    return Response.json(await createCustomization(await authenticateStorefrontIdentity(request), parseCreateCustomization({ ...body, idempotencyKey }), request.headers.get("X-MTM-Guest-Id")), { status: 201, headers: storefrontCors });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "定制实例创建失败" }, { status, headers: storefrontCors });
  }
}
