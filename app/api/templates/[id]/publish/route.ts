import { route } from "@/src/middleware/http";
import { parseSaveTemplate } from "@/src/schemas/template";
import { publishTemplate } from "@/src/services/template-service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return route(async () => publishTemplate(id, parseSaveTemplate(await request.json())));
}
