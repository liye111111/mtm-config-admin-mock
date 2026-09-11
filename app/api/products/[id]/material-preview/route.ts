import { route } from "@/src/middleware/http";
import { getProductMaterialPreview } from "@/src/services/product-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  return route(() => getProductMaterialPreview(request, id));
}
