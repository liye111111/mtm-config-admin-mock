import { z } from "zod";
import { AppError } from "@/src/shared/errors";

export function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const field = issue.path.length ? `${issue.path.join(".")}：` : "";
  throw new AppError(`${field}${issue.message}`);
}
