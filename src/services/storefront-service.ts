import { templateView, type TemplateConfig } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import type { ValidateConfigurationInput } from "@/src/schemas/storefront";
import * as templates from "@/src/repositories/template-repository";

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

export async function getStorefrontConfig(productId: string) {
  const row = await templates.findPublishedTemplateForProduct(productId);
  if (!row) return { enabled: false as const, configuration: null };
  return { enabled: true as const, configuration: await storefrontConfiguration(row, productId) };
}

export async function validateConfiguration(input: ValidateConfigurationInput) {
  const row = await templates.findPublishedTemplateForProduct(input.productId);
  if (!row) throw new NotFoundError("商品没有已发布的定制配置");
  if (input.configVersion && input.configVersion !== row.version) throw new AppError(`配置版本已更新，请刷新页面（当前 v${row.version}）`, 409);
  const config = templateView(row).config;
  for (const step of config.steps.filter((item) => item.enabled)) {
    if (step.type !== "options" || !step.options.length) continue;
    const selected = String(input.selections[step.code] ?? "");
    if (step.required && !selected) throw new AppError(`请选择${step.title}`);
    if (selected && !step.options.some((option) => option.enabled && option.code === selected)) throw new AppError(`${step.title}包含无效选项`);
  }
  return { valid: true, configId: crypto.randomUUID(), configVersion: row.version, validatedAt: new Date().toISOString() };
}
