import type { TemplateConfig } from "./template";
import { AppError } from "@/src/shared/errors";

export function ensureUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new AppError(`${label}重复：${value}`);
    seen.add(value);
  }
}

// 草稿可缺展示素材；层级和标识不能损坏，否则编辑和移动会定位到错误对象。
export function validateStepStructure(config: TemplateConfig, publishing = false) {
  ensureUnique(config.steps.map((step) => step.code), "步骤编码");
  ensureUnique(config.steps.map((step) => step.id), "步骤 ID");
  const groups = config.steps.flatMap((step) => step.optionGroups);
  ensureUnique(groups.map((group) => group.code), "选项组编码");
  ensureUnique(groups.map((group) => group.id), "选项组 ID");
  const reserved = new Set(["measurements", "dimensions", "components", "embroidery_enabled", "embroidery_position", "embroidery_font", "embroidery_color", "embroidery_text", "__proto__", "constructor", "prototype"]);
  for (const group of groups) if (reserved.has(group.code)) throw new AppError(`选项组编码为系统保留字：${group.code}`);
  for (const step of config.steps) {
    if (step.type !== "options" && step.optionGroups.length) throw new AppError(`${step.title}不是普通选项步骤，不能包含选项组`);
    for (const group of step.optionGroups) {
      const label = `${step.title} / ${group.title}`;
      ensureUnique(group.options.map((option) => option.code), `${label}选项编码`);
      ensureUnique(group.options.map((option) => option.id), `${label}选项 ID`);
      if (group.options.filter((option) => option.enabled && option.defaultSelected).length > 1) throw new AppError(`${label}只能设置一个启用的默认选项`);
      if (publishing && step.enabled && group.enabled && group.displayStyle !== "text") {
        for (const option of group.options.filter((item) => item.enabled)) {
          if (!option.displayImage) throw new AppError(`${label} / ${option.name}缺少展示素材，请选择图片后发布`);
        }
      }
    }
    if (step.type === "embroidery") {
      if (!step.textInput || !step.embroidery) throw new AppError(`${step.title}缺少刺绣文字规则或位置、字体、颜色字典`);
      for (const [label, choices] of [["位置", step.embroidery.positions], ["字体", step.embroidery.fonts], ["颜色", step.embroidery.colors]] as const) {
        ensureUnique(choices.map((choice) => choice.code), `${step.title}${label}编码`);
      }
    } else if (step.textInput || step.embroidery) {
      throw new AppError(`${step.title}不是刺绣步骤，不能配置刺绣规则`);
    }
  }
}

export function validateOptionSelections(config: Pick<TemplateConfig, "steps">, selections: Record<string, unknown>) {
  const selected: Array<{ groupTitle: string; optionName: string }> = [];
  const groups = config.steps.filter((step) => step.enabled && step.type === "options")
    .flatMap((step) => step.optionGroups.filter((group) => group.enabled && group.options.some((option) => option.enabled)));
  const allowed = new Set([...groups.map((group) => group.code), "measurements", "dimensions", "components", "embroidery_enabled", "embroidery_position", "embroidery_font", "embroidery_color", "embroidery_text"]);
  for (const key of Object.keys(selections)) {
    if (!allowed.has(key)) throw new AppError(`配置已更新或包含无效选项组：${key}，请重新选择`, 422);
  }
  for (const group of groups) {
    const value = selections[group.code];
    if (value === undefined || value === "") {
      if (group.required) throw new AppError(`请选择${group.title}`, 422);
      continue;
    }
    if (typeof value !== "string") throw new AppError(`${group.title}必须选择一个有效选项`, 422);
    const option = group.options.find((item) => item.enabled && item.code === value);
    if (!option) throw new AppError(`${group.title}包含无效选项`, 422);
    selected.push({ groupTitle: group.title, optionName: option.name });
  }
  return selected;
}
