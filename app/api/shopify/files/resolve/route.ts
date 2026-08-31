import { adminRoute } from "@/src/middleware/http";
import { AppError } from "@/src/shared/errors";
import { resolveImages } from "@/src/services/template-media-service";

export async function POST(request: Request) {
  return adminRoute(request, async (shopId) => {
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new AppError("请求必须是有效 JSON"); }
    return resolveImages(request, shopId, body);
  });
}
