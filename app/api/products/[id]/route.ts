import { route } from "@/src/middleware/http";
import { parseProductBinding } from "@/src/schemas/product";
import { removeProductBinding, saveProductBinding } from "@/src/services/product-service";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) { const { id } = await params; return route(async () => saveProductBinding(id, parseProductBinding(await request.json()))); }
export async function DELETE(_request: Request, { params }: Context) { const { id } = await params; return route(async () => { await removeProductBinding(id); return null; }); }
