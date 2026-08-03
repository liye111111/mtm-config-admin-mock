import { authenticateStorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { parseMeasurementProfileQuery, parseSaveMeasurementProfile } from "@/src/schemas/storefront";
import { deleteMeasurementProfile, getMeasurementProfile, saveMeasurementProfile } from "@/src/services/measurement-profile-service";

export async function OPTIONS() { return optionsResponse(); }

function query(request: Request) {
  const params = new URL(request.url).searchParams;
  return parseMeasurementProfileQuery({ productId: params.get("productId"), guestId: request.headers.get("X-MTM-Guest-Id") || undefined });
}

export async function GET(request: Request) {
  return storefrontRoute(async () => getMeasurementProfile(await authenticateStorefrontIdentity(request), query(request)));
}

export async function PUT(request: Request) {
  return storefrontRoute(async () => {
    const body = await request.json() as Record<string, unknown>;
    return saveMeasurementProfile(await authenticateStorefrontIdentity(request), parseSaveMeasurementProfile({ ...body, guestId: request.headers.get("X-MTM-Guest-Id") || body.guestId }));
  });
}

export async function DELETE(request: Request) {
  return storefrontRoute(async () => deleteMeasurementProfile(await authenticateStorefrontIdentity(request), query(request)));
}
