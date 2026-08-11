import { authenticateStorefront } from "@/src/integrations/shopify-app-proxy";
import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { parseMockSizeRecommendation } from "@/src/schemas/storefront";
import { recommendMockSize } from "@/src/services/size-recommendation-service";

export async function OPTIONS() { return optionsResponse(); }
export async function POST(request: Request) {
  return storefrontRoute(async () => recommendMockSize(await authenticateStorefront(request), parseMockSizeRecommendation(await request.json())));
}
