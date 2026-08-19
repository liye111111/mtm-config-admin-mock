import { z } from "zod";
import { parseWithSchema } from "./parse";

export const productTypeBindingInputSchema = z.object({
  productType: z.string().trim().min(1, "自定义分类不能为空").max(255),
});

export type ProductTypeBindingInput = z.infer<typeof productTypeBindingInputSchema>;
export function parseProductTypeBindingInput(value: unknown) { return parseWithSchema(productTypeBindingInputSchema, value); }
