import { authenticateStorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { parseAccountMeasurementProfile } from "@/src/schemas/storefront";
import { deleteAccountMeasurementProfile, getAccountMeasurementProfile, saveAccountMeasurementProfile } from "@/src/services/measurement-profile-service";
import { AppError } from "@/src/shared/errors";

const MAX_BODY_BYTES = 16 * 1024;

async function readBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new AppError("请求内容过大", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new AppError("请求内容过大", 413);
  try { return JSON.parse(text) as unknown; }
  catch { throw new AppError("请求必须是有效 JSON", 400); }
}

export async function OPTIONS() { return optionsResponse(); }
export async function GET(request: Request) {
  return storefrontRoute(async () => getAccountMeasurementProfile(await authenticateStorefrontIdentity(request)));
}
export async function PUT(request: Request) {
  return storefrontRoute(async () => saveAccountMeasurementProfile(
    await authenticateStorefrontIdentity(request),
    parseAccountMeasurementProfile(await readBody(request)),
  ));
}
export async function DELETE(request: Request) {
  return storefrontRoute(async () => deleteAccountMeasurementProfile(await authenticateStorefrontIdentity(request)));
}
