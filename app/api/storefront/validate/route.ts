import { optionsResponse, storefrontCors } from "@/src/middleware/http";
import { AppError } from "@/src/shared/errors";
import { parseValidateConfiguration } from "@/src/schemas/storefront";
import { validateConfiguration } from "@/src/services/storefront-service";
export async function OPTIONS() { return optionsResponse(); }
export async function POST(request: Request) {
  try { return Response.json(await validateConfiguration(parseValidateConfiguration(await request.json())), { headers: storefrontCors }); }
  catch (error) { const status = error instanceof AppError ? error.status : 500; return Response.json({ valid: false, error: error instanceof Error ? error.message : "配置校验失败" }, { status, headers: storefrontCors }); }
}
