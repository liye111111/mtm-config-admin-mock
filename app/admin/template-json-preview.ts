import type { TemplateView } from "./types";

export function storefrontTemplatePreview(draft: TemplateView, templates: TemplateView[]) {
  if (draft.config.templateType !== "composite") return { templateId: draft.code, version: draft.version, ...draft.config };
  const published = new Map(templates.filter((item) => item.status === "published" && item.config.templateType === "single").map((item) => [item.id, item]));
  return {
    templateId: draft.code,
    version: draft.version,
    ...draft.config,
    components: draft.config.components.map((component) => {
      const child = published.get(component.childTemplateId);
      return child ? { ...component, template: { templateId: child.code, version: child.version, ...child.config } } : component;
    }),
  };
}
