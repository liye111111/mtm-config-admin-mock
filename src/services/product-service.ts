import { productBindingView, templateView } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import type { SaveProductBindingInput } from "@/src/schemas/product";
import * as products from "@/src/repositories/product-repository";
import * as templates from "@/src/repositories/template-repository";

async function validateBinding(input: SaveProductBindingInput) {
  const template = await templates.findPublishedTemplate(input.templateId);
  if (!template) throw new AppError("商品只能绑定已发布模板");
  if (input.publishedVersion !== null && !await templates.findTemplateVersion(input.templateId, input.publishedVersion)) throw new AppError("指定的模板发布版本不存在");
  return templateView(template);
}

export async function getProductBindings() { return (await products.listProductBindings()).map(productBindingView); }
export async function createProductBinding(input: SaveProductBindingInput) { await validateBinding(input); return productBindingView(await products.createProductBinding(input)); }
export async function saveProductBinding(id: string, input: SaveProductBindingInput) {
  await validateBinding(input);
  const row = await products.updateProductBinding(id, input);
  if (!row) throw new NotFoundError("Binding not found");
  return productBindingView(row);
}
export async function removeProductBinding(id: string) { await products.deleteProductBinding(id); }
