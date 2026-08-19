import { adminRoute } from "@/src/middleware/http";
import { getSizeChartVersions } from "@/src/services/size-chart-service";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, (shopId) => getSizeChartVersions(shopId, id)); }

