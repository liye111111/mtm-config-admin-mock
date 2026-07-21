import type { TemplateConfig } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import type { ValidateConfigurationInput } from "@/src/schemas/storefront";
import * as templates from "@/src/repositories/template-repository";

export async function getStorefrontConfig(productId: string) {
  const row = await templates.findPublishedTemplateForProduct(productId);
  if (!row) throw new NotFoundError("No published configuration");
  const config = JSON.parse(row.config_json) as TemplateConfig;
  if (config.templateType === "composite") {
    config.orderLineMode = "single_line";
    if (config.pieces?.length) config.pieces = await Promise.all(config.pieces.map(async (piece) => {
      if (!piece.templateId) return piece;
      const child = await templates.findPublishedTemplate(piece.templateId);
      return child ? { ...piece, template: { templateId: child.code, version: child.version, ...JSON.parse(child.config_json) as TemplateConfig } } : piece;
    }));
  }
  return { templateId: row.code, version: row.version, productId, ...config };
}

export async function validateConfiguration(input: ValidateConfigurationInput) {
  const row = await templates.findPublishedTemplateForProduct(input.productId);
  if (!row) throw new NotFoundError("商品没有已发布的定制配置");
  if (input.configVersion && input.configVersion !== row.version) throw new AppError(`配置版本已更新，请刷新页面（当前 v${row.version}）`, 409);
  const config = JSON.parse(row.config_json) as TemplateConfig;
  for (const step of config.steps ?? []) {
    if (step.type !== "options" || !step.options?.length) continue;
    const selected = String(input.selections[step.code] ?? "");
    if (step.required !== false && !selected) throw new AppError(`请选择${step.title}`);
    if (selected && !step.options.some((option) => option.value === selected)) throw new AppError(`${step.title}包含无效选项`);
  }
  return { valid: true, configId: crypto.randomUUID(), configVersion: row.version, validatedAt: new Date().toISOString() };
}
