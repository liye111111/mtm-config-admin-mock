import { authenticateStorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { parseClaimMeasurementProfile } from "@/src/schemas/storefront";
import { claimGuestProfile } from "@/src/services/measurement-profile-service";

export async function OPTIONS() { return optionsResponse(); }
export async function POST(request: Request) {
  return storefrontRoute(async () => claimGuestProfile(await authenticateStorefrontIdentity(request), parseClaimMeasurementProfile(await request.json())));
}
