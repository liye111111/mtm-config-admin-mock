export async function GET() {
  return Response.json({ success: true, service: "mtm-config-admin-mock", timestamp: new Date().toISOString() });
}
