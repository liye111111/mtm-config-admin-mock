import { templateView, type TemplateConfig } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import type { CreateCustomizationInput, ValidateConfigurationInput } from "@/src/schemas/storefront";
import * as templates from "@/src/repositories/template-repository";
import * as customizations from "@/src/repositories/customization-repository";
import { verifyShopifyVariant } from "@/src/integrations/shopify-admin";
import type { StorefrontIdentity } from "@/src/integrations/shopify-app-proxy";
import { resolveMeasurementMetadata, type ResolvedTemplateConfig } from "./measurement-config-service";

async function storefrontConfiguration(shopId: string, row: NonNullable<Awaited<ReturnType<typeof templates.findPublishedTemplateForProduct>>>, productId: string) {
  const view = templateView(row);
  const config: ResolvedTemplateConfig & { components: Array<TemplateConfig["components"][number] & { template?: object }> } = await resolveMeasurementMetadata(shopId, view.config);
  if (config.templateType === "composite") {
    config.components = await Promise.all(config.components.map(async (component) => {
      if (!component.childTemplateId) return component;
      const child = await templates.findPublishedTemplate(component.childTemplateId);
      if (!child) return component;
      const childView = templateView(child);
      return { ...component, template: { templateId: childView.code, version: childView.version, ...await resolveMeasurementMetadata(shopId, childView.config) } };
    }));
  }
  return { templateId: view.code, version: view.version, productId, ...config };
}

export async function getStorefrontConfig(shopId: string, productId: string) {
  const row = await templates.findPublishedTemplateForProduct(shopId, productId);
  if (!row) return { enabled: false as const, configuration: null };
  return { enabled: true as const, configuration: await storefrontConfiguration(shopId, row, productId) };
}

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function addReadableProperty(properties: Record<string, string>, label: string, value: string) {
  let key = label, sequence = 2;
  while (properties[key] !== undefined) key = `${label}（${sequence++}）`;
  properties[key] = value;
}
function validateTemplateSelections(config: ResolvedTemplateConfig, selections: Record<string, unknown>, summary: string[], properties: Record<string, string>, validateMeasurements = true, propertyLabelPrefix = "") {
  for (const step of config.steps.filter((item) => item.enabled)) {
    if (step.type === "options" && step.options.length) {
      const selected = String(selections[step.code] ?? "");
      if (step.required && !selected) throw new AppError(`请选择${step.title}`, 422);
      if (!selected) continue;
      const option = step.options.find((item) => item.enabled && item.code === selected);
      if (!option) throw new AppError(`${step.title}包含无效选项`, 422);
      addReadableProperty(properties, `定制 · ${propertyLabelPrefix}${step.title}`, option.name);
      summary.push(option.name);
    }
    if (step.type === "embroidery") {
      const enabled = selections.embroidery_enabled;
      if (typeof enabled !== "boolean") throw new AppError("请选择是否需要刺绣", 422);
      if (!enabled) {
        if (["embroidery_position", "embroidery_font", "embroidery_color", "embroidery_text"].some((key) => String(selections[key] ?? "").trim())) throw new AppError("无需刺绣时不能提交刺绣明细", 422);
        addReadableProperty(properties, `刺绣 · ${propertyLabelPrefix}服务`, "无需刺绣");
        summary.push("无需刺绣");
        continue;
      }
      if (!step.embroidery || !step.textInput) throw new AppError("刺绣配置不完整", 500);
      const selectedChoice = (key: string, label: string, choices: Array<{code: string; name: string}>) => {
        const code = String(selections[key] ?? "");
        const choice = choices.find((item) => item.code === code);
        if (!choice) throw new AppError(`请选择${label}`, 422);
        return choice.name;
      };
      const position = selectedChoice("embroidery_position", "刺绣位置", step.embroidery.positions);
      const font = selectedChoice("embroidery_font", "刺绣字体", step.embroidery.fonts);
      const color = selectedChoice("embroidery_color", "刺绣颜色", step.embroidery.colors);
      const text = typeof selections.embroidery_text === "string" ? selections.embroidery_text.trim() : "";
      const length = [...text].length;
      if (length < step.textInput.minLength || length > step.textInput.maxLength) throw new AppError(`刺绣文字必须为 ${step.textInput.minLength}-${step.textInput.maxLength} 个字符`, 422);
      if (step.textInput.characterPolicy === "letters_only" && !/^[A-Za-z]+$/.test(text)) throw new AppError("刺绣文字仅允许英文字母", 422);
      if (step.textInput.characterPolicy === "letters_numbers_spaces" && !/^[A-Za-z0-9 ]+$/.test(text)) throw new AppError("刺绣文字仅允许英文、数字和空格", 422);
      addReadableProperty(properties, `刺绣 · ${propertyLabelPrefix}服务`, "需要刺绣");
      addReadableProperty(properties, `刺绣 · ${propertyLabelPrefix}位置`, position);
      addReadableProperty(properties, `刺绣 · ${propertyLabelPrefix}字体`, font);
      addReadableProperty(properties, `刺绣 · ${propertyLabelPrefix}颜色`, color);
      addReadableProperty(properties, `刺绣 · ${propertyLabelPrefix}文字`, text);
      summary.push(`刺绣：${position} / ${font} / ${color} / ${text}`);
    }
  }
  if (validateMeasurements) {
    const measurements = record(selections.measurements);
    for (const block of config.measurementBlocks.filter((item) => item.enabled)) for (const field of block.fields.filter((item) => item.enabled)) {
      const raw = measurements[field.code];
      if (field.required && (raw === undefined || raw === null || raw === "")) throw new AppError(`请填写${field.name}`, 422);
      if (raw === undefined || raw === null || raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < field.min || value > field.max) throw new AppError(`${field.name}必须在 ${field.min}-${field.max} ${field.standardUnit} 之间`, 422);
      addReadableProperty(properties, `量体 · ${block.name} · ${field.name}`, `${value} ${field.standardUnit}`);
      summary.push(`${field.name} ${value}${field.standardUnit}`);
    }
  }
  const dimensions = record(selections.dimensions);
  for (const block of config.dimensionBlocks.filter((item) => item.enabled)) for (const field of block.fields.filter((item) => item.enabled)) {
    const raw = dimensions[field.code];
    if (field.required && (raw === undefined || raw === null || raw === "")) throw new AppError(`请填写${field.name}`, 422);
    if (raw === undefined || raw === null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < field.min || value > field.max) throw new AppError(`${field.name}必须在 ${field.min}-${field.max} ${field.standardUnit} 之间`, 422);
    summary.push(`${field.name} ${value}${field.standardUnit}`);
  }
}
async function validateAuthoritatively(shopId: string, input: ValidateConfigurationInput) {
  const row = await templates.findPublishedTemplateForProduct(shopId, input.productId);
  if (!row) throw new NotFoundError("商品没有已发布的定制配置");
  if (input.configVersion && input.configVersion !== row.version) throw new AppError(`配置版本已更新，请刷新页面（当前 v${row.version}）`, 409);
  const config = await resolveMeasurementMetadata(shopId, templateView(row).config);
  await verifyShopifyVariant(shopId, input.productId, input.variantId);
  const summary: string[] = [];
  const lineItemProperties: Record<string, string> = {};
  validateTemplateSelections(config, input.selections, summary, lineItemProperties);
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
      validateTemplateSelections(await resolveMeasurementMetadata(shopId, templateView(child).config), selected, summary, lineItemProperties, false, `${component.name} · `);
    }
  }
  return { row, summary: summary.join(" / ") || `定制配置 v${row.version}`, lineItemProperties };
}
export async function validateConfiguration(shopId: string, input: ValidateConfigurationInput) { const result = await validateAuthoritatively(shopId, input); return { valid: true, errors: [], configVersion: result.row.version, validatedAt: new Date().toISOString() }; }
function instanceResponse(row: NonNullable<Awaited<ReturnType<typeof customizations.createCustomizationInstance>>>, visibleProperties: Record<string, string>) { const template = `${row.template_code}@${row.template_version}`; return { customizationId: row.id, status: row.status, configVersion: row.template_version, lineItemPropertiesVersion: 3, summary: row.summary, lineItemProperties: { "定制摘要": row.summary, ...visibleProperties, "定制编号": row.id, "定制模板": template, "_mtm_customization_id": row.id, "_mtm_template": template } }; }
async function hashGuestId(guestId?: string | null) { if (!guestId) return null; const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(guestId))); return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
export async function createCustomization(identity: StorefrontIdentity, input: CreateCustomizationInput, guestId?: string | null) { const { row, summary, lineItemProperties } = await validateAuthoritatively(identity.shopId, input); const existing = await customizations.findByIdempotencyKey(identity.shopId, input.idempotencyKey); if (existing) return instanceResponse(existing, lineItemProperties); try { const created = await customizations.createCustomizationInstance({ shopId: identity.shopId, customerId: identity.customerId, guestIdHash: await hashGuestId(guestId), input, templateId: row.id, templateCode: row.code, templateVersion: row.version, schemaVersion: row.schema_version, summary }); if (!created) throw new AppError("定制实例创建失败", 500); return instanceResponse(created, lineItemProperties); } catch (error) { const concurrent = await customizations.findByIdempotencyKey(identity.shopId, input.idempotencyKey); if (concurrent) return instanceResponse(concurrent, lineItemProperties); throw error; } }
