import { adminRoute } from "@/src/middleware/http";
import { getTemplateVersions } from "@/src/services/template-service";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminRoute(request, () => getTemplateVersions(id));
}
