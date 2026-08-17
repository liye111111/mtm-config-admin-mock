import { adminRoute } from "@/src/middleware/http";
import { parseAdminCustomerMeasurementProfile } from "@/src/schemas/storefront";
import { deleteCustomerMeasurementProfileForAdmin, getCustomerMeasurementProfileForAdmin, updateCustomerMeasurementProfileForAdmin } from "@/src/services/measurement-profile-service";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { return adminRoute(request, async (shopId) => getCustomerMeasurementProfileForAdmin(shopId, (await params).id)); }
export async function PUT(request: Request, { params }: Context) { return adminRoute(request, async (shopId) => updateCustomerMeasurementProfileForAdmin(shopId, (await params).id, parseAdminCustomerMeasurementProfile(await request.json()))); }
export async function DELETE(request: Request, { params }: Context) { return adminRoute(request, async (shopId) => deleteCustomerMeasurementProfileForAdmin(shopId, (await params).id)); }
