import { productBindingView } from "@/src/domain/models";
import { NotFoundError } from "@/src/shared/errors";
import type { SaveProductBindingInput } from "@/src/schemas/product";
import * as products from "@/src/repositories/product-repository";

export async function getProductBindings() { return (await products.listProductBindings()).map(productBindingView); }
export async function createProductBinding(input: SaveProductBindingInput) { return productBindingView(await products.createProductBinding(input)); }
export async function saveProductBinding(id: string, input: SaveProductBindingInput) {
  const row = await products.updateProductBinding(id, input);
  if (!row) throw new NotFoundError("Binding not found");
  return productBindingView(row);
}
export async function removeProductBinding(id: string) { await products.deleteProductBinding(id); }
