import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
export async function resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: new URL("./worker-env.mjs", import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith("@/") || specifier.startsWith(".")) {
    const base = specifier.startsWith("@/") ? new URL(specifier.slice(2), root) : new URL(specifier, context.parentURL);
    for (const suffix of ["", ".ts", "/index.ts"]) {
      const candidate = fileURLToPath(base) + suffix;
      try { if ((await stat(candidate)).isFile()) return { url: pathToFileURL(candidate).href, shortCircuit: true }; } catch { /* 尝试下一个 TypeScript 路径。 */ }
    }
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    return { format: "module", source: ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
  }
  return next(url, context);
}
