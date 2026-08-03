import { route } from "@/src/middleware/http";
import { parseAdminCustomerMeasurementProfile } from "@/src/schemas/storefront";
import { deleteCustomerMeasurementProfileForAdmin, getCustomerMeasurementProfileForAdmin, updateCustomerMeasurementProfileForAdmin } from "@/src/services/measurement-profile-service";

type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) { return route(async () => getCustomerMeasurementProfileForAdmin((await params).id)); }
export async function PUT(request: Request, { params }: Context) { return route(async () => updateCustomerMeasurementProfileForAdmin((await params).id, parseAdminCustomerMeasurementProfile(await request.json()))); }
export async function DELETE(_: Request, { params }: Context) { return route(async () => deleteCustomerMeasurementProfileForAdmin((await params).id)); }
