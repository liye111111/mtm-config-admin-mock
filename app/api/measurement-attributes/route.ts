import { adminRoute } from "@/src/middleware/http";
import { parseMeasurementAttributeInput, parseMeasurementAttributeQuery } from "@/src/schemas/measurement-attribute";
import { createMeasurementAttribute, getMeasurementAttributes } from "@/src/services/measurement-attribute-service";

export async function GET(request: Request) { return adminRoute(request, (shopId) => getMeasurementAttributes(shopId, parseMeasurementAttributeQuery(new URL(request.url)))); }
export async function POST(request: Request) { return adminRoute(request, async (shopId) => createMeasurementAttribute(shopId, parseMeasurementAttributeInput(await request.json())), { successStatus: 201 }); }
