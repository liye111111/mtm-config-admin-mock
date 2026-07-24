import { route } from "@/src/middleware/http";
import { authenticateAdminList } from "@/src/integrations/shopify-admin";
import { findProductBinding } from "@/src/repositories/product-repository";
import { getStorefrontConfig } from "@/src/services/storefront-service";
import { NotFoundError } from "@/src/shared/errors";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  return route(async () => {
    const shopId = await authenticateAdminList(request);
    const binding = await findProductBinding(id, shopId);
    if (!binding) throw new NotFoundError("Binding not found");
    return getStorefrontConfig(binding.shopify_product_id);
  });
}
