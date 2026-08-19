import { adminRoute } from "@/src/middleware/http";
import { parseCreateSizeChart } from "@/src/schemas/size-chart";
import { createSizeChart, getSizeCharts } from "@/src/services/size-chart-service";

export async function GET(request: Request) { return adminRoute(request, getSizeCharts); }
export async function POST(request: Request) { return adminRoute(request, async (shopId) => createSizeChart(shopId, parseCreateSizeChart(await request.json())), { successStatus: 201 }); }

