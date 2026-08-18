import type { ResolvedMeasurementFieldDefinition, TemplateConfig } from "@/src/domain";
import { AppError } from "@/src/shared/errors";
import * as attributes from "@/src/repositories/measurement-attribute-repository";

export type ResolvedTemplateConfig = Omit<TemplateConfig, "measurementBlocks"> & {
  measurementBlocks: Array<Omit<TemplateConfig["measurementBlocks"][number], "fields"> & { fields: ResolvedMeasurementFieldDefinition[] }>;
};

export async function resolveMeasurementMetadata(shopId: string, config: TemplateConfig): Promise<ResolvedTemplateConfig> {
  await attributes.ensureDefaultAttributes(shopId);
  const ids = [...new Set(config.measurementBlocks.flatMap((block) => block.fields.map((field) => field.attributeId)))];
  const rows = await Promise.all(ids.map((id) => attributes.findMeasurementAttribute(id, shopId)));
  const byId = new Map(rows.filter(Boolean).map((row) => [row!.id, row!]));
  return {
    ...structuredClone(config),
    measurementBlocks: config.measurementBlocks.map((block) => ({
      ...block,
      fields: block.fields.map((field) => {
        const attribute = byId.get(field.attributeId);
        if (!attribute) throw new AppError(`模板引用的量体属性不存在：${field.attributeId}`, 500);
        if (!attribute.enabled) throw new AppError(`模板引用的量体属性已停用：${attribute.name}`, 500);
        return {
          ...field,
          code: attribute.code,
          name: field.labelOverride || attribute.name,
          description: field.descriptionOverride || attribute.description || undefined,
          valueType: attribute.value_type,
          dimension: attribute.dimension,
          standardUnit: field.inputUnit,
          precision: attribute.precision,
        };
      }),
    })),
  };
}
