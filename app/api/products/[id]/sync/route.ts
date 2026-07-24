import { route } from "@/src/middleware/http";
import { syncProductBinding } from "@/src/services/product-service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  return route(() => syncProductBinding(request, id));
}
