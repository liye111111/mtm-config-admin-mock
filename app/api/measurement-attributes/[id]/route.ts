import { adminRoute } from "@/src/middleware/http";
import { parseMeasurementAttributeInput } from "@/src/schemas/measurement-attribute";
import { removeMeasurementAttribute, saveMeasurementAttribute } from "@/src/services/measurement-attribute-service";

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, async (shopId) => saveMeasurementAttribute(shopId, id, parseMeasurementAttributeInput(await request.json()))); }
export async function DELETE(request: Request, { params }: Context) { const { id } = await params; return adminRoute(request, async (shopId) => { await removeMeasurementAttribute(shopId, id); return null; }); }
