import { route } from "@/src/middleware/http";
import { getTemplateVersions } from "@/src/services/template-service";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return route(() => getTemplateVersions(id));
}
