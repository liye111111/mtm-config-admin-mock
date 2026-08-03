import { route } from "@/src/middleware/http";
import { listMeasurementProfiles } from "@/src/repositories/measurement-profile-repository";
import { parseAdminCustomerMeasurementProfile } from "@/src/schemas/storefront";
import { createCustomerMeasurementProfileForAdmin } from "@/src/services/measurement-profile-service";

export async function GET() {
  return route(async () => (await listMeasurementProfiles()).map((row) => {
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
  return route(async () => createCustomerMeasurementProfileForAdmin(parseAdminCustomerMeasurementProfile(await request.json())), { successStatus: 201 });
}
