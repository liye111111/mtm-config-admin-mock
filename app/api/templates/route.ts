import { adminRoute } from "@/src/middleware/http";
import { parseCreateTemplate } from "@/src/schemas/template";
import { createTemplate, getTemplates } from "@/src/services/template-service";
import { canonicalizeTemplateImages } from "@/src/services/template-media-service";

export async function GET(request: Request) { return adminRoute(request, getTemplates); }
export async function POST(request: Request) {
  return adminRoute(request, async (shopId) => {
    const input = parseCreateTemplate(await request.json());
    input.config = await canonicalizeTemplateImages(request, shopId, input.config);
    return createTemplate(input);
  }, { successStatus: 201 });
}
