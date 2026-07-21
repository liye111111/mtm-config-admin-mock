import { route } from "@/src/middleware/http";
import { parseCreateTemplate } from "@/src/schemas/template";
import { createTemplate, getTemplates } from "@/src/services/template-service";

export async function GET() { return route(getTemplates); }
export async function POST(request: Request) {
  return route(async () => createTemplate(parseCreateTemplate(await request.json())), { successStatus: 201 });
}
