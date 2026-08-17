import { adminRoute } from "@/src/middleware/http";
import { listMeasurementProfiles } from "@/src/repositories/measurement-profile-repository";
import { parseAdminCustomerMeasurementProfile } from "@/src/schemas/storefront";
import { createCustomerMeasurementProfileForAdmin } from "@/src/services/measurement-profile-service";

export async function GET(request: Request) {
  return adminRoute(request, async (shopId) => (await listMeasurementProfiles(shopId)).map((row) => {
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
  }));
}

export async function POST(request: Request) {
  return adminRoute(request, async (shopId) => createCustomerMeasurementProfileForAdmin(shopId, parseAdminCustomerMeasurementProfile(await request.json())), { successStatus: 201 });
}
