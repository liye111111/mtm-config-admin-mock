import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { getStorefrontConfig } from "@/src/services/storefront-service";
import { authenticateStorefront } from "@/src/integrations/shopify-app-proxy";
export async function OPTIONS() { return optionsResponse(); }
export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) { const { productId } = await params; return storefrontRoute(async () => getStorefrontConfig(await authenticateStorefront(request), productId)); }
