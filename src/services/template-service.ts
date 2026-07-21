import { templateView } from "@/src/domain/models";
import { AppError, NotFoundError } from "@/src/shared/errors";
import type { SaveTemplateInput } from "@/src/schemas/template";
import * as templates from "@/src/repositories/template-repository";

export async function getTemplates() { return (await templates.listTemplates()).map(templateView); }
export async function createTemplate(input: Parameters<typeof templates.createTemplate>[0]) { return templateView(await templates.createTemplate(input)); }
export async function saveTemplate(id: string, input: SaveTemplateInput) {
  const row = await templates.updateTemplate(id, input);
  if (!row) throw new NotFoundError("Template not found");
  return templateView(row);
}
export async function removeTemplate(id: string) {
  if (!await templates.findTemplate(id)) throw new NotFoundError("Template not found");
  await templates.deleteTemplate(id);
}
export async function publishTemplate(id: string, input: SaveTemplateInput) {
  const { config } = input;
  if (!config.steps?.length) throw new AppError("至少需要一个定制步骤");
  if (config.templateType === "composite") {
    config.orderLineMode = "single_line";
    const pieces = config.pieces ?? [], min = Number(config.pieceSelection?.min ?? 1), max = Number(config.pieceSelection?.max ?? pieces.length);
    if (!pieces.length) throw new AppError("组合模板至少需要一个定制单品");
    if (min < 1 || max < min || max > pieces.length) throw new AppError("单品最少/最多选择数量无效");
    const codes = new Set<string>();
    for (const piece of pieces) {
      if (!piece.code?.trim() || !piece.name?.trim()) throw new AppError("单品名称和编码不能为空");
      if (codes.has(piece.code)) throw new AppError(`单品编码重复：${piece.code}`);
      codes.add(piece.code);
      if (!piece.templateId) throw new AppError(`${piece.name} 未绑定子定制模板`);
      if (!await templates.findPublishedTemplate(piece.templateId)) throw new AppError(`${piece.name} 绑定的子模板尚未发布`);
    }
  }
  const current = await templates.findTemplate(id);
  if (!current) throw new NotFoundError("Template not found");
  return templateView(await templates.publishTemplate(id, input, current));
}
export async function getTemplateVersions(id: string) {
  return (await templates.listTemplateVersions(id)).map((row: unknown) => {
    const value = row as Record<string, unknown>;
    return { id: value.id, templateId: value.template_id, version: value.version, config: JSON.parse(String(value.config_json)), publishedAt: value.published_at };
  });
}
