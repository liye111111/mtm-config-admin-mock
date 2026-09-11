import { productBindingView, templateView } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import type { SaveProductBindingInput } from "@/src/schemas/product";
import * as products from "@/src/repositories/product-repository";
import * as templates from "@/src/repositories/template-repository";
import { authenticateAdminList, queryShopifyMaterialPreviewProduct, resolveShopifyProduct, setShopifyCustomizationMarker, type ShopifyCustomizationMarker } from "@/src/integrations/shopify-admin";
import { parseStoredVariantOptionMappings, parseStoredVisibleVariantMetafields } from "@/src/schemas/product";
import type { VariantOptionMappings } from "@/src/domain/product-binding";

async function validateBinding(input: SaveProductBindingInput) {
  const template = await templates.findPublishedTemplate(input.templateId);
  if (!template) throw new AppError("商品只能绑定已发布模板");
  if (input.publishedVersion !== null && !await templates.findTemplateVersion(input.templateId, input.publishedVersion)) throw new AppError("指定的模板发布版本不存在");
  const view = templateView(template);
  if (input.productKind === "suite" && view.config.templateType !== "composite") throw new AppError("普通套装商品必须绑定组合模板", 422);
  if (input.productKind === "single" && view.config.templateType !== "single") throw new AppError("普通单品必须绑定单品模板", 422);
  return view;
}

function customizationMarker(input: SaveProductBindingInput, template: Awaited<ReturnType<typeof validateBinding>>): ShopifyCustomizationMarker {
  if (!input.enabled) return { enabled: false };
  return { enabled: true, templateCode: template.code, templateVersion: input.publishedVersion ?? template.version };
}

function resolveVariantOptionMappings(input: SaveProductBindingInput, template: Awaited<ReturnType<typeof validateBinding>>, product: Awaited<ReturnType<typeof resolveShopifyProduct>>): SaveProductBindingInput {
  const mappings: VariantOptionMappings = Object.fromEntries(Object.entries(input.variantOptionMappings).map(([role, mapping]) => {
    const option = product.options.find((item) => item.id === mapping.shopifyOptionId);
    if (!option) throw new AppError(`Shopify Option 映射已失效：${role}`, 422);
    return [role, { shopifyOptionId: option.id, name: option.name, position: option.position }];
  }));
  const requiresMaterial = template.config.steps.some((step) => step.enabled && step.type === "material");
  if (requiresMaterial && !mappings.material) {
    if (product.options.length !== 1) throw new AppError("请为材质步骤选择对应的 Shopify Option", 422);
    const option = product.options[0];
    mappings.material = { shopifyOptionId: option.id, name: option.name, position: option.position };
  }
  return { ...input, variantOptionMappings: mappings };
}

export async function getProductBindings(request: Request) { const shopId = await authenticateAdminList(request); return (await products.listProductBindings(shopId)).map(productBindingView); }
export async function getProductBinding(request: Request, id: string) { const shopId = await authenticateAdminList(request); const row = await products.findProductBinding(id, shopId); if (!row) throw new NotFoundError("Binding not found"); return productBindingView(row); }
export async function getProductMaterialPreview(request: Request, id: string) { const shopId = await authenticateAdminList(request); const row = await products.findProductBinding(id, shopId); if (!row) throw new NotFoundError("Binding not found"); return queryShopifyMaterialPreviewProduct(request, shopId, row.shopify_product_gid, parseStoredVariantOptionMappings(row.variant_option_mappings_json).material); }
export async function createProductBinding(request: Request, input: SaveProductBindingInput) { const template = await validateBinding(input); const product = await resolveShopifyProduct(request, input); input = resolveVariantOptionMappings(input, template, product); if (product.status === "ARCHIVED") throw new AppError("已归档商品不能启用定制", 422); if (await products.findByProduct(product.shopId, product.gid)) throw new AppError("该 Shopify 商品已经绑定定制模板", 409); await setShopifyCustomizationMarker(request, product.gid, product.shopId, customizationMarker(input, template)); try { return productBindingView(await products.createProductBinding(input, product)); } catch (error) { await setShopifyCustomizationMarker(request, product.gid, product.shopId, { enabled: false }).catch(() => undefined); throw error; } }
export async function saveProductBinding(request: Request, id: string, input: SaveProductBindingInput) {
  const template = await validateBinding(input); const product = await resolveShopifyProduct(request, input); input = resolveVariantOptionMappings(input, template, product); const existing = await products.findProductBinding(id, product.shopId); if (!existing) throw new NotFoundError("Binding not found"); const duplicate = await products.findByProduct(product.shopId, product.gid); if (duplicate && duplicate.id !== id) throw new AppError("该 Shopify 商品已经绑定定制模板", 409);
  await setShopifyCustomizationMarker(request, product.gid, product.shopId, customizationMarker(input, template));
  if (existing.shopify_product_gid !== product.gid) await setShopifyCustomizationMarker(request, existing.shopify_product_gid, existing.shop_id, { enabled: false }).catch(async (error) => { await setShopifyCustomizationMarker(request, product.gid, product.shopId, { enabled: false }).catch(() => undefined); throw error; });
  const row = await products.updateProductBinding(id, input, product).catch(async (error) => { const oldTemplate = await templates.findPublishedTemplate(existing.template_id); await setShopifyCustomizationMarker(request, existing.shopify_product_gid, existing.shop_id, oldTemplate && existing.enabled === 1 ? { enabled: true, templateCode: oldTemplate.code, templateVersion: existing.published_version ?? oldTemplate.version } : { enabled: false }).catch(() => undefined); if (existing.shopify_product_gid !== product.gid) await setShopifyCustomizationMarker(request, product.gid, product.shopId, { enabled: false }).catch(() => undefined); throw error; });
  if (!row) throw new NotFoundError("Binding not found");
  return productBindingView(row);
}
export async function removeProductBinding(request: Request, id: string) { const shopId = await authenticateAdminList(request); const existing = await products.findProductBinding(id, shopId); if (!existing) throw new NotFoundError("Binding not found"); await setShopifyCustomizationMarker(request, existing.shopify_product_gid, shopId, { enabled: false }); await products.deleteProductBinding(id, shopId).catch(async (error) => { const template = await templates.findPublishedTemplate(existing.template_id); if (template && existing.enabled === 1) await setShopifyCustomizationMarker(request, existing.shopify_product_gid, shopId, { enabled: true, templateCode: template.code, templateVersion: existing.published_version ?? template.version }).catch(() => undefined); throw error; }); }

export async function syncProductBinding(request: Request, id: string) {
  const shopId = await authenticateAdminList(request);
  const existing = await products.findProductBinding(id, shopId);
  if (!existing) throw new NotFoundError("Binding not found");
  let input: SaveProductBindingInput = {
    shopifyProductGid: existing.shopify_product_gid,
    productKind: existing.product_kind as SaveProductBindingInput["productKind"],
    templateId: existing.template_id,
    variantOptionMappings: parseStoredVariantOptionMappings(existing.variant_option_mappings_json),
    visibleVariantMetafields: parseStoredVisibleVariantMetafields(existing.visible_variant_metafields_json),
    publishedVersion: existing.published_version,
    enabled: existing.enabled === 1,
    mockProduct: { title: existing.product_title, handle: existing.product_handle || "", imageUrl: existing.product_image_url || undefined, imageAlt: existing.product_image_alt || undefined, status: existing.product_status as "ACTIVE" | "DRAFT" | "ARCHIVED", variantCount: existing.variant_count, onlineStoreUrl: existing.online_store_url || undefined, updatedAt: existing.shopify_updated_at || undefined, options: Object.values(parseStoredVariantOptionMappings(existing.variant_option_mappings_json)) },
  };
  const product = await resolveShopifyProduct(request, input);
  const template = await validateBinding(input);
  input = resolveVariantOptionMappings(input, template, product);
  await setShopifyCustomizationMarker(request, product.gid, product.shopId, customizationMarker(input, template));
  const row = await products.updateProductBinding(id, input, product);
  if (!row) throw new NotFoundError("Binding not found");
  return productBindingView(row);
}
