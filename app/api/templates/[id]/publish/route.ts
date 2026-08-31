import { adminRoute } from "@/src/middleware/http";
import { parseSaveTemplate } from "@/src/schemas/template";
import { publishTemplate } from "@/src/services/template-service";
import { canonicalizeTemplateImages } from "@/src/services/template-media-service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminRoute(request, async (shopId) => {
    const input = parseSaveTemplate(await request.json());
    input.config = await canonicalizeTemplateImages(request, shopId, input.config);
    return publishTemplate(id, input);
  });
}
