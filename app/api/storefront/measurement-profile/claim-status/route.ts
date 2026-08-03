import { authenticateStorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { parseClaimMeasurementProfile } from "@/src/schemas/storefront";
import { getClaimStatus } from "@/src/services/measurement-profile-service";

export async function OPTIONS() { return optionsResponse(); }
export async function GET(request: Request) {
  return storefrontRoute(async () => {
    const guestId = parseClaimMeasurementProfile({ guestId: request.headers.get("X-MTM-Guest-Id"), strategy: "keep_customer" }).guestId;
    return getClaimStatus(await authenticateStorefrontIdentity(request), guestId);
  });
}
