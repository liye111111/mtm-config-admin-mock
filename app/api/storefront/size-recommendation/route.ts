import { authenticateStorefront } from "@/src/integrations/shopify-app-proxy";
import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { parseSizeRecommendation } from "@/src/schemas/storefront";
import { recommendSize } from "@/src/services/size-recommendation-service";

export async function OPTIONS() { return optionsResponse(); }
export async function POST(request: Request) {
  return storefrontRoute(async () => recommendSize(await authenticateStorefront(request), parseSizeRecommendation(await request.json())));
}
