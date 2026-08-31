import { adminRoute } from "@/src/middleware/http";
import { parseSaveTemplate } from "@/src/schemas/template";
import { removeTemplate, saveTemplate } from "@/src/services/template-service";
import { canonicalizeTemplateImages } from "@/src/services/template-media-service";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  return adminRoute(request, async (shopId) => {
    const input = parseSaveTemplate(await request.json());
    input.config = await canonicalizeTemplateImages(request, shopId, input.config);
    return saveTemplate(id, input);
  });
}
export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  return adminRoute(request, async () => { await removeTemplate(id); return null; });
}
