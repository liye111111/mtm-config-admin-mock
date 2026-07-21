import { AppError } from "@/src/shared/errors";

export const storefrontCors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
export function optionsResponse() { return new Response(null, { status: 204, headers: storefrontCors }); }
export async function route<T>(operation: () => Promise<T>, options: { successStatus?: number; headers?: HeadersInit; fallback?: string } = {}) {
  try {
    const data = await operation();
    return Response.json({ success: true, data }, { status: options.successStatus ?? 200, headers: options.headers });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : options.fallback ?? "Internal server error" }, { status, headers: options.headers });
  }
}
export async function storefrontRoute<T>(operation: () => Promise<T>) {
  try { return Response.json(await operation(), { headers: storefrontCors }); }
  catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Storefront request failed" }, { status, headers: storefrontCors });
  }
}
