import { adminRoute } from "@/src/middleware/http";
import { removeProductTypeBinding } from "@/src/services/product-type-size-chart-binding-service";

type Context = { params: Promise<{ id: string; bindingId: string }> };
export async function DELETE(request: Request, { params }: Context) { const { id, bindingId } = await params; return adminRoute(request, async (shopId) => { await removeProductTypeBinding(shopId, id, bindingId); return null; }); }
