import { z } from "zod";
import { parseWithSchema } from "./parse";

const requiredId = (message: string) => z.preprocess((value) => value == null ? "" : String(value), z.string().trim().min(1, message));
export const validateConfigurationSchema = z.object({
  productId: requiredId("productId 必填"),
  variantId: requiredId("variantId 必填"),
  configVersion: z.coerce.number().int().positive().optional(),
  selections: z.record(z.string(), z.unknown()).default({}),
});

export type ValidateConfigurationInput = z.infer<typeof validateConfigurationSchema>;
export function parseValidateConfiguration(value: unknown): ValidateConfigurationInput { return parseWithSchema(validateConfigurationSchema, value); }
