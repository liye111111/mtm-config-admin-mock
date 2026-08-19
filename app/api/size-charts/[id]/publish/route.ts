import { adminRoute } from "@/src/middleware/http";
import { publishSizeChart } from "@/src/services/size-chart-service";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, (shopId) => publishSizeChart(shopId, id)); }

