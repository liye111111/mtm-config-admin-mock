import type { TemplateConfig } from "./template";

// 组合步骤是子模板在总流程中的展开位置，与量体等独立步骤并列。
export function ensureComponentsStep(config: TemplateConfig) {
  if (config.templateType !== "composite") return;
  if (config.steps.some((step) => step.type === "components" && step.enabled)) return;
  const existing = config.steps.find((step) => step.type === "components");
  if (existing) { existing.enabled = true; return; }
  const codes = new Set(config.steps.map((step) => step.code));
  let code = "components", index = 1;
  while (codes.has(code)) code = `components_${index++}`;
  config.steps.push({ id: crypto.randomUUID(), code, title: "单品定制", type: "components", required: true, enabled: true,
    sortOrder: Math.min(0, ...config.steps.map((step) => step.sortOrder)) - 1, optionGroups: [] });
  config.steps.sort((a, b) => a.sortOrder - b.sortOrder).forEach((step, position) => { step.sortOrder = position; });
}
