import { adminRoute } from "@/src/middleware/http";
import { listMeasurementProfiles, type MeasurementProfileFilter } from "@/src/repositories/measurement-profile-repository";
import { parseAdminCustomerMeasurementProfile } from "@/src/schemas/storefront";
import { createCustomerMeasurementProfileForAdmin } from "@/src/services/measurement-profile-service";

export async function GET(request: Request) {
  return adminRoute(request, async (shopId) => {
    const search = new URL(request.url).searchParams;
    const requestedFilter = search.get("filter") || "all";
    const filter: MeasurementProfileFilter = ["all", "customer", "guest", "activeGuest"].includes(requestedFilter) ? requestedFilter as MeasurementProfileFilter : "all";
    const page = Math.max(1, Number.parseInt(search.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(search.get("pageSize") || "20", 10) || 20));
    const result = await listMeasurementProfiles(shopId, { filter, page, pageSize });
    const items = result.items.map((row) => {
    let fieldCount = 0;
    try {
      const measurements = JSON.parse(row.measurements_json) as unknown;
      if (measurements && typeof measurements === "object" && !Array.isArray(measurements)) fieldCount = Object.keys(measurements).length;
    } catch { fieldCount = 0; }
    return {
      id: row.id,
      shopId: row.shop_id,
      ownerType: row.customer_id ? "customer" as const : "guest" as const,
      customerId: row.customer_id,
      customerEmail: row.customer_email,
      customerName: row.customer_name,
      unit: row.unit,
      schemaVersion: row.schema_version,
      fieldCount,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    });
    return { ...result, items };
  });
}

export async function POST(request: Request) {
  return adminRoute(request, async (shopId) => createCustomerMeasurementProfileForAdmin(shopId, parseAdminCustomerMeasurementProfile(await request.json())), { successStatus: 201 });
}
