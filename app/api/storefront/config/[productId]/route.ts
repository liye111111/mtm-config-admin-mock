import { optionsResponse, storefrontRoute } from "@/src/middleware/http";
import { getStorefrontConfig } from "@/src/services/storefront-service";
export async function OPTIONS() { return optionsResponse(); }
export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) { const { productId } = await params; return storefrontRoute(() => getStorefrontConfig(productId)); }
