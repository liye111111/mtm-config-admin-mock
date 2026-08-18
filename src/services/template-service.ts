import { garmentCategoryLabels, type TemplateConfig } from "@/src/domain";
import { templateView } from "@/src/domain/models";
import { parseStoredTemplateConfig } from "@/src/schemas/template";
import type { SaveTemplateInput } from "@/src/schemas/template";
import { AppError, NotFoundError } from "@/src/shared/errors";
import * as templates from "@/src/repositories/template-repository";
import * as categories from "@/src/repositories/template-category-repository";

function ensureUnique(codes: string[], label: string) {
  const seen = new Set<string>();
  for (const code of codes) {
    if (seen.has(code)) throw new AppError(`${label}编码重复：${code}`);
    seen.add(code);
  }
}

async function validateTemplateConfig(config: TemplateConfig) {
  if (!config.steps.length) throw new AppError("至少需要一个定制步骤");
  ensureUnique(config.steps.map((step) => step.code), "步骤");
  for (const step of config.steps) {
    ensureUnique(step.options.map((option) => option.code), `${step.title}选项`);
    const selectedDefaults = step.options.filter((option) => option.enabled && option.defaultSelected);
    if (selectedDefaults.length > 1 && step.type === "options") throw new AppError(`${step.title}只能设置一个默认选项`);
    const isTextInput = step.type === "options" && step.displayType === "text_input";
    const isEmbroidery = step.type === "embroidery";
    if (isTextInput) {
      if (!step.textInput) throw new AppError(`${step.title}缺少文本输入规则`);
      if (step.options.length) throw new AppError(`${step.title}是文本输入步骤，不能包含候选选项`);
      if (step.textInput.minLength > step.textInput.maxLength) throw new AppError(`${step.title}的最小字符数不能大于最大字符数`);
    } else if (isEmbroidery) {
      if (!step.textInput) throw new AppError(`${step.title}缺少刺绣文字规则`);
      if (!step.embroidery) throw new AppError(`${step.title}缺少刺绣位置、字体或颜色字典`);
      if (step.options.length) throw new AppError(`${step.title}是刺绣步骤，不能包含普通候选选项`);
      if (step.textInput.minLength > step.textInput.maxLength) throw new AppError(`${step.title}的最小字符数不能大于最大字符数`);
      for (const [label, choices] of [["位置", step.embroidery.positions], ["字体", step.embroidery.fonts], ["颜色", step.embroidery.colors]] as const) {
        ensureUnique(choices.map((choice) => choice.code), `${step.title}${label}`);
      }
    } else {
      if (step.textInput) throw new AppError(`${step.title}不是文本输入步骤，不能配置文本输入规则`);
      if (step.embroidery) throw new AppError(`${step.title}不是刺绣步骤，不能配置刺绣字典`);
    }
  }
  ensureUnique(config.measurementBlocks.map((block) => block.code), "尺寸块");
  for (const block of config.measurementBlocks) {
    ensureUnique(block.fields.map((field) => field.attributeId), `${block.name}量体属性`);
    for (const field of block.fields) if (field.min >= field.max) throw new AppError(`${field.labelOverride || "量体字段"}的最小值必须小于最大值`);
  }
  ensureUnique(config.dimensionBlocks.map((block) => block.code), "成品尺寸块");
  for (const block of config.dimensionBlocks) {
    ensureUnique(block.fields.map((field) => field.code), `${block.name}尺寸字段`);
    for (const field of block.fields) if (field.min >= field.max) throw new AppError(`${field.name}的最小值必须小于最大值`);
  }
  if (config.templateType !== "composite") {
    if (config.components.length) throw new AppError("单品模板不能包含套装逻辑组件");
    if (config.steps.some((step) => step.type === "components")) throw new AppError("单品模板不能包含组合/套装步骤");
    return;
  }
  if (!config.components.length) throw new AppError("组合模板至少需要一个固定逻辑组件");
  ensureUnique(config.components.map((component) => component.code), "逻辑组件");
  const enabledComponentsSteps = config.steps.filter((step) => step.enabled && step.type === "components");
  if (enabledComponentsSteps.length !== 1) throw new AppError("组合模板必须且只能包含一个启用的组合/套装步骤");
  for (const component of config.components) {
    if (!component.childTemplateId) throw new AppError(`${component.name}未绑定子定制模板`);
    const child = await templates.findPublishedTemplate(component.childTemplateId);
    if (!child) throw new AppError(`${component.name}绑定的子模板尚未发布`);
    const childView = templateView(child);
    if (childView.config.templateType !== "single") throw new AppError(`${component.name}只能绑定单品模板`);
    if (childView.category !== component.category) throw new AppError(`${component.name}品类与子模板不一致（应为${garmentCategoryLabels[component.category] ?? component.category}）`);
  }
}

async function validateCategories(category: string, config: TemplateConfig) {
  const referenced = new Set([category, ...config.components.map((item)=>item.category), ...config.steps.flatMap((step)=>step.options.flatMap((option)=>option.applicableCategories)), ...config.measurementBlocks.flatMap((block)=>block.applicableCategories), ...config.dimensionBlocks.flatMap((block)=>block.applicableCategories)]);
  for (const code of referenced) if (!await categories.findCategoryByCode(code)) throw new AppError(`模板品类不存在：${code}`);
}

export async function getTemplates() { return (await templates.listTemplates()).map(templateView); }
export async function createTemplate(input: Parameters<typeof templates.createTemplate>[0]) { await validateCategories(input.category,input.config); return templateView(await templates.createTemplate(input)); }
export async function saveTemplate(id: string, input: SaveTemplateInput) {
  await validateCategories(input.category,input.config);
  const row = await templates.updateTemplate(id, input);
  if (!row) throw new NotFoundError("Template not found");
  return templateView(row);
}
export async function removeTemplate(id: string) {
  if (!await templates.findTemplate(id)) throw new NotFoundError("Template not found");
  await templates.deleteTemplate(id);
}
export async function publishTemplate(id: string, input: SaveTemplateInput) {
  await validateCategories(input.category,input.config);
  await validateTemplateConfig(input.config);
  const current = await templates.findTemplate(id);
  if (!current) throw new NotFoundError("Template not found");
  return templateView(await templates.publishTemplate(id, input, current));
}
export async function getTemplateVersions(id: string) {
  const template = await templates.findTemplate(id);
  if (!template) throw new NotFoundError("Template not found");
  return (await templates.listTemplateVersions(id)).map((row) => ({
    id: row.id,
    templateId: row.template_id,
    version: row.version,
    schemaVersion: row.schema_version,
    config: parseStoredTemplateConfig(row.config_json, row.schema_version),
    publishedAt: row.published_at,
  }));
}
