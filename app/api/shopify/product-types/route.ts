import { getShopifyProductTypes } from "@/src/integrations/shopify-admin";
import { route } from "@/src/middleware/http";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get("search") ?? "";
  return route(() => getShopifyProductTypes(request, search));
}
