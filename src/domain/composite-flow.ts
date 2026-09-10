import type { TemplateConfig } from "./template";
import { createUniqueCode } from "./code";

// 组合步骤是子模板在总流程中的展开位置，与量体等独立步骤并列。
export function ensureComponentsStep(config: TemplateConfig) {
  if (config.templateType !== "composite") return;
  if (config.steps.some((step) => step.type === "components" && step.enabled)) return;
  const existing = config.steps.find((step) => step.type === "components");
  if (existing) { existing.enabled = true; return; }
  config.steps.push({ id: crypto.randomUUID(), code: createUniqueCode("step"), title: "单品定制", type: "components", required: true, enabled: true,
    sortOrder: Math.min(0, ...config.steps.map((step) => step.sortOrder)) - 1, optionGroups: [] });
  config.steps.sort((a, b) => a.sortOrder - b.sortOrder).forEach((step, position) => { step.sortOrder = position; });
}
