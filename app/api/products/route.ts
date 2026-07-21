import { route } from "@/src/middleware/http";
import { parseProductBinding } from "@/src/schemas/product";
import { createProductBinding, getProductBindings } from "@/src/services/product-service";
export async function GET() { return route(getProductBindings); }
export async function POST(request: Request) { return route(async () => createProductBinding(parseProductBinding(await request.json())), { successStatus: 201 }); }
