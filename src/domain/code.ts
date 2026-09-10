import type { TemplateConfig } from "./template";

export function createUniqueCode(prefix: string): string {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "") || "item";
  return `${safePrefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function regenerateTemplateIdentifiers(config: TemplateConfig): TemplateConfig {
  const next = structuredClone(config);

  next.components.forEach((component) => {
    component.id = crypto.randomUUID();
    component.code = createUniqueCode("component");
  });
  next.steps.forEach((step) => {
    step.id = crypto.randomUUID();
    step.code = createUniqueCode("step");
    step.optionGroups.forEach((group) => {
      group.id = crypto.randomUUID();
      group.code = createUniqueCode("group");
      group.options.forEach((option) => {
        option.id = crypto.randomUUID();
        option.code = createUniqueCode("option");
      });
    });
    for (const [prefix, choices] of [
      ["position", step.embroidery?.positions],
      ["font", step.embroidery?.fonts],
      ["color", step.embroidery?.colors],
    ] as const) {
      choices?.forEach((choice) => { choice.code = createUniqueCode(prefix); });
    }
  });
  for (const [prefix, blocks] of [
    ["measurement_block", next.measurementBlocks],
    ["dimension_block", next.dimensionBlocks],
  ] as const) {
    blocks.forEach((block) => {
      block.id = crypto.randomUUID();
      block.code = createUniqueCode(prefix);
      block.fields.forEach((field) => {
        field.id = crypto.randomUUID();
        if ("code" in field) field.code = createUniqueCode("dimension");
      });
    });
  }
  return next;
}
