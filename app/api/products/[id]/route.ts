import { route } from "@/src/middleware/http";
import { parseProductBinding } from "@/src/schemas/product";
import { getProductBinding, removeProductBinding, saveProductBinding } from "@/src/services/product-service";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { const { id } = await params; return route(() => getProductBinding(request, id)); }
export async function PUT(request: Request, { params }: Context) { const { id } = await params; return route(async () => saveProductBinding(request, id, parseProductBinding(await request.json()))); }
export async function DELETE(request: Request, { params }: Context) { const { id } = await params; return route(async () => { await removeProductBinding(request, id); return null; }); }
