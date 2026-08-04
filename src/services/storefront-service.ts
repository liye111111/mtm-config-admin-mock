import { templateView, type TemplateConfig } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import type { CreateCustomizationInput, ValidateConfigurationInput } from "@/src/schemas/storefront";
import * as templates from "@/src/repositories/template-repository";
import * as customizations from "@/src/repositories/customization-repository";
import { verifyShopifyVariant } from "@/src/integrations/shopify-admin";
import type { StorefrontIdentity } from "@/src/integrations/shopify-app-proxy";

async function storefrontConfiguration(row: NonNullable<Awaited<ReturnType<typeof templates.findPublishedTemplateForProduct>>>, productId: string) {
  const view = templateView(row);
  const config: TemplateConfig & { components: Array<TemplateConfig["components"][number] & { template?: object }> } = structuredClone(view.config);
  if (config.templateType === "composite") {
    config.components = await Promise.all(config.components.map(async (component) => {
      if (!component.childTemplateId) return component;
      const child = await templates.findPublishedTemplate(component.childTemplateId);
      if (!child) return component;
      const childView = templateView(child);
      return { ...component, template: { templateId: childView.code, version: childView.version, ...childView.config } };
    }));
  }
  return { templateId: view.code, version: view.version, productId, ...config };
}

export async function getStorefrontConfig(shopId: string, productId: string) {
  const row = await templates.findPublishedTemplateForProduct(shopId, productId);
  if (!row) return { enabled: false as const, configuration: null };
  return { enabled: true as const, configuration: await storefrontConfiguration(row, productId) };
}

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function validateTemplateSelections(config: TemplateConfig, selections: Record<string, unknown>, summary: string[], validateMeasurements = true) {
  for (const step of config.steps.filter((item) => item.enabled)) {
    if (step.type !== "options" || !step.options.length) continue;
    const selected = String(selections[step.code] ?? "");
    if (step.required && !selected) throw new AppError(`请选择${step.title}`, 422);
    if (!selected) continue;
    const option = step.options.find((item) => item.enabled && item.code === selected);
    if (!option) throw new AppError(`${step.title}包含无效选项`, 422);
    summary.push(option.name);
  }
  if (validateMeasurements) {
    const measurements = record(selections.measurements);
    for (const block of config.measurementBlocks.filter((item) => item.enabled)) for (const field of block.fields.filter((item) => item.enabled)) {
      const raw = measurements[field.code];
      if (field.required && (raw === undefined || raw === null || raw === "")) throw new AppError(`请填写${field.name}`, 422);
      if (raw === undefined || raw === null || raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < field.min || value > field.max) throw new AppError(`${field.name}必须在 ${field.min}-${field.max} ${field.standardUnit} 之间`, 422);
    }
  }
}
async function validateAuthoritatively(shopId: string, input: ValidateConfigurationInput) {
  const row = await templates.findPublishedTemplateForProduct(shopId, input.productId);
  if (!row) throw new NotFoundError("商品没有已发布的定制配置");
  if (input.configVersion && input.configVersion !== row.version) throw new AppError(`配置版本已更新，请刷新页面（当前 v${row.version}）`, 409);
  const config = templateView(row).config;
  await verifyShopifyVariant(shopId, input.productId, input.variantId);
  const summary: string[] = [];
  validateTemplateSelections(config, input.selections, summary);
  if (config.templateType === "composite") {
    const componentSelections = record(input.selections.components);
    for (const component of config.components.filter((item) => item.customizationEnabled)) {
      const selected = record(componentSelections[component.code]);
      if (component.required && !Object.keys(selected).length) throw new AppError(`请完成${component.name}定制`, 422);
      const child = component.childTemplateId ? await templates.findPublishedTemplate(component.childTemplateId) : null;
      if (!child) throw new AppError(`${component.name}未配置有效的已发布单品模板`, 422);
      // A composite template collects measurements once at the root level.
      // Child templates contribute customization options only and must not
      // require a second, component-local copy of the same measurements.
      validateTemplateSelections(templateView(child).config, selected, summary, false);
    }
  }
  return { row, summary: summary.join(" / ") || `定制配置 v${row.version}` };
}
export async function validateConfiguration(shopId: string, input: ValidateConfigurationInput) { const result = await validateAuthoritatively(shopId, input); return { valid: true, errors: [], configVersion: result.row.version, validatedAt: new Date().toISOString() }; }
function instanceResponse(row: NonNullable<Awaited<ReturnType<typeof customizations.createCustomizationInstance>>>) { return { customizationId: row.id, status: row.status, configVersion: row.template_version, summary: row.summary, lineItemProperties: { "定制摘要": row.summary, "_mtm_customization_id": row.id, "_mtm_template": `${row.template_code}@${row.template_version}` } }; }
async function hashGuestId(guestId?: string | null) { if (!guestId) return null; const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(guestId))); return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
export async function createCustomization(identity: StorefrontIdentity, input: CreateCustomizationInput, guestId?: string | null) { const existing = await customizations.findByIdempotencyKey(identity.shopId, input.idempotencyKey); if (existing) return instanceResponse(existing); const { row, summary } = await validateAuthoritatively(identity.shopId, input); try { const created = await customizations.createCustomizationInstance({ shopId: identity.shopId, customerId: identity.customerId, guestIdHash: await hashGuestId(guestId), input, templateId: row.id, templateCode: row.code, templateVersion: row.version, schemaVersion: row.schema_version, summary }); if (!created) throw new AppError("定制实例创建失败", 500); return instanceResponse(created); } catch (error) { const concurrent = await customizations.findByIdempotencyKey(identity.shopId, input.idempotencyKey); if (concurrent) return instanceResponse(concurrent); throw error; } }
