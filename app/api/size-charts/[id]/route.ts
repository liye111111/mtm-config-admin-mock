import { adminRoute } from "@/src/middleware/http";
import { parseUpdateSizeChart } from "@/src/schemas/size-chart";
import { getSizeChart, removeSizeChart, saveSizeChart } from "@/src/services/size-chart-service";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, (shopId) => getSizeChart(shopId, id)); }
export async function PUT(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, async (shopId) => saveSizeChart(shopId, id, parseUpdateSizeChart(await request.json()))); }
export async function DELETE(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, async (shopId) => { await removeSizeChart(shopId, id); return null; }); }

