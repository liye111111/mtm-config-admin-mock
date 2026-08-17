import { adminRoute } from "@/src/middleware/http";
import { parseCreateTemplate } from "@/src/schemas/template";
import { createTemplate, getTemplates } from "@/src/services/template-service";

export async function GET(request: Request) { return adminRoute(request, getTemplates); }
export async function POST(request: Request) {
  return adminRoute(request, async () => createTemplate(parseCreateTemplate(await request.json())), { successStatus: 201 });
}
