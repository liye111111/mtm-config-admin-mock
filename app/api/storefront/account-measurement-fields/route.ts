import { authenticateStorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { getAccountMeasurementFields } from "@/src/services/measurement-profile-service";

export async function OPTIONS() { return optionsResponse(); }
export async function GET(request: Request) {
  return storefrontRoute(async () => getAccountMeasurementFields(await authenticateStorefrontIdentity(request)));
}
