import { adminRoute } from "@/src/middleware/http";
import { parseProductTypeBindingInput } from "@/src/schemas/product-type-size-chart-binding";
import { addProductTypeBinding, getProductTypeBindings } from "@/src/services/product-type-size-chart-binding-service";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, (shopId) => getProductTypeBindings(shopId, id)); }
export async function POST(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, async (shopId) => addProductTypeBinding(shopId, id, parseProductTypeBindingInput(await request.json()).productType), { successStatus: 201 }); }

