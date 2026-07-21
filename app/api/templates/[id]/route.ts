import { route } from "@/src/middleware/http";
import { parseSaveTemplate } from "@/src/schemas/template";
import { removeTemplate, saveTemplate } from "@/src/services/template-service";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  return route(async () => saveTemplate(id, parseSaveTemplate(await request.json())));
}
export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return route(async () => { await removeTemplate(id); return null; });
}
