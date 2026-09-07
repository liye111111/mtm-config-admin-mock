#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();
const TARGETS_DIR = path.join(PROJECT_ROOT, "deploy", "targets");
const GENERATED_CONFIG = path.join(PROJECT_ROOT, "dist", "server", "wrangler.json");
const SECRET_NAME_PATTERN = /(secret|token|password|private[_-]?key|api[_-]?key)/i;
const RESERVED_VAR_NAMES = new Set(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "D1_DATABASE_ID"]);

function fail(message) {
  console.error(`部署配置错误：${message}`);
  process.exit(1);
}

function usage() {
  console.log(`用法：npm run deploy:target -- <target|config.json> [--dry-run] [--skip-migrations]

示例：
  npm run deploy:target -- customer-a --dry-run
  npm run deploy:target -- deploy/targets/customer-a.json

Secret 文件：
  deploy/targets/<target>_secret.json
  CLOUDFLARE_API_TOKEN 仅用于部署，不会上传到 Worker。`);
}

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const hasInput = options.input !== undefined;
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    env: options.env ?? process.env,
    input: options.input,
    stdio: hasInput ? ["pipe", "inherit", "inherit"] : "inherit",
    shell: false,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runCapture(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: false,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") fail(`${field} 必须是非空字符串`);
  return value.trim();
}

function validateTarget(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("目标配置必须是 JSON 对象");

  const accountId = requiredString(raw.accountId, "accountId");
  if (!/^[a-f0-9]{32}$/i.test(accountId)) fail("accountId 必须是 32 位 Cloudflare Account ID");

  const workerName = requiredString(raw.workerName, "workerName");
  const databaseName = requiredString(raw.d1?.databaseName, "d1.databaseName");
  const databaseId = raw.d1?.databaseId === undefined
    ? undefined
    : requiredString(raw.d1.databaseId, "d1.databaseId");
  if (databaseId && !/^[a-f0-9-]{36}$/i.test(databaseId)) fail("d1.databaseId 必须是有效的 D1 UUID");
  const location = raw.d1?.location;
  if (location !== undefined && !["weur", "eeur", "apac", "oc", "wnam", "enam"].includes(location)) {
    fail("d1.location 必须是 weur、eeur、apac、oc、wnam 或 enam");
  }
  const jurisdiction = raw.d1?.jurisdiction;
  if (jurisdiction !== undefined && !["eu", "fedramp"].includes(jurisdiction)) {
    fail("d1.jurisdiction 必须是 eu 或 fedramp");
  }
  if (location && jurisdiction) fail("d1.location 和 d1.jurisdiction 不能同时配置");

  const vars = raw.vars ?? {};
  if (typeof vars !== "object" || Array.isArray(vars)) fail("vars 必须是 JSON 对象");
  for (const [name, value] of Object.entries(vars)) {
    if (RESERVED_VAR_NAMES.has(name)) {
      fail(`vars.${name} 是部署脚本保留字段，请使用目标配置中的专用字段或进程环境变量`);
    }
    if (SECRET_NAME_PATTERN.test(name)) {
      fail(`vars.${name} 看起来是敏感配置；请改用 wrangler secret put 或 CI Secret`);
    }
    if (typeof value !== "string") fail(`vars.${name} 必须是字符串`);
  }

  const routes = raw.routes ?? undefined;
  if (routes !== undefined && !Array.isArray(routes)) fail("routes 必须是数组");
  if (raw.profile !== undefined) {
    fail("当前项目的 Wrangler 版本不支持 profile；请删除 profile 并在 Secret 文件配置 CLOUDFLARE_API_TOKEN");
  }

  return {
    accountId,
    workerName,
    d1: { databaseName, databaseId, location, jurisdiction },
    vars,
    routes,
    runMigrations: raw.runMigrations !== false,
  };
}

async function loadSecrets(secretFile) {
  let fileStat;
  try {
    fileStat = await stat(secretFile);
  } catch (error) {
    if (error.code === "ENOENT") fail(`缺少 Secret 文件：${path.relative(PROJECT_ROOT, secretFile)}`);
    throw error;
  }

  if ((fileStat.mode & 0o077) !== 0) {
    await chmod(secretFile, 0o600);
    console.log(`已将 ${path.relative(PROJECT_ROOT, secretFile)} 权限收紧为仅当前用户可读写。`);
  }

  let secrets;
  try {
    secrets = JSON.parse(await readFile(secretFile, "utf8"));
  } catch (error) {
    fail(`无法解析 ${path.relative(PROJECT_ROOT, secretFile)}：${error.message}`);
  }
  if (!secrets || typeof secrets !== "object" || Array.isArray(secrets)) {
    fail("Secret 文件必须是 JSON 对象");
  }
  const entries = Object.entries(secrets);
  if (entries.length === 0) fail("Secret 文件不能为空");
  for (const [name, value] of entries) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) fail(`Secret 名称无效：${name}`);
    if (typeof value !== "string" || value.length === 0) fail(`Secret ${name} 必须是非空字符串`);
  }
  return secrets;
}

function parseDatabaseList(output) {
  try {
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed)) fail("Wrangler 返回了无法识别的 D1 列表");
    return parsed;
  } catch (error) {
    fail(`无法解析 Wrangler D1 列表：${error.message}`);
  }
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const positional = args.filter((arg) => !arg.startsWith("--"));
if (positional.length !== 1) {
  usage();
  process.exit(1);
}

const dryRun = args.includes("--dry-run");
const skipMigrations = args.includes("--skip-migrations");
const unknownFlags = args.filter(
  (arg) => arg.startsWith("--") && !["--dry-run", "--skip-migrations"].includes(arg),
);
if (unknownFlags.length) fail(`未知参数：${unknownFlags.join(", ")}`);

const targetArg = positional[0];
const targetFile = targetArg.endsWith(".json")
  ? path.resolve(PROJECT_ROOT, targetArg)
  : path.join(TARGETS_DIR, `${targetArg}.json`);
const targetName = path.basename(targetFile, ".json");
const secretFile = path.join(path.dirname(targetFile), `${targetName}_secret.json`);

let rawTarget;
try {
  rawTarget = JSON.parse(await readFile(targetFile, "utf8"));
} catch (error) {
  fail(`无法读取 ${path.relative(PROJECT_ROOT, targetFile)}：${error.message}`);
}
const target = validateTarget(rawTarget);
const secrets = await loadSecrets(secretFile);
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN || secrets.CLOUDFLARE_API_TOKEN;
const workerSecrets = Object.fromEntries(
  Object.entries(secrets).filter(([name]) => name !== "CLOUDFLARE_API_TOKEN"),
);

if (!cloudflareApiToken) fail("未设置 CLOUDFLARE_API_TOKEN，请写入目标 Secret 文件或进程环境变量");
if (Object.keys(workerSecrets).length === 0) fail("Secret 文件中没有可上传到 Worker 的 Secret");

console.log(`目标：${targetName}`);
console.log(`Worker：${target.workerName}`);
console.log(`D1：${target.d1.databaseName}`);
console.log(`模式：${dryRun ? "仅验证，不部署" : "部署"}`);

const cloudflareEnv = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: target.accountId,
  CLOUDFLARE_API_TOKEN: cloudflareApiToken,
};
const listDatabases = () => parseDatabaseList(runCapture(
  "npx",
  ["wrangler", "d1", "list", "--json"],
  { env: cloudflareEnv },
));

let databaseId = target.d1.databaseId;
const existingDatabase = listDatabases().find((database) => database.name === target.d1.databaseName);
if (databaseId && existingDatabase && existingDatabase.uuid !== databaseId) {
  fail(`D1 名称 ${target.d1.databaseName} 已存在，但 UUID 与目标配置不一致`);
}
if (databaseId && !existingDatabase) {
  fail(`目标配置指定了 D1 UUID，但账号中不存在名为 ${target.d1.databaseName} 的数据库`);
}
if (!databaseId && existingDatabase) {
  databaseId = requiredString(existingDatabase.uuid, "Wrangler D1 UUID");
  console.log("已找到现有 D1 数据库。 ");
}
if (!databaseId && dryRun) {
  databaseId = "00000000-0000-4000-8000-000000000000";
  console.log("目标 D1 尚不存在；正式部署时将自动创建。 ");
}
if (!databaseId) {
  run("npx", [
    "wrangler",
    "d1",
    "create",
    target.d1.databaseName,
    ...(target.d1.location ? ["--location", target.d1.location] : []),
    ...(target.d1.jurisdiction ? ["--jurisdiction", target.d1.jurisdiction] : []),
  ], { env: cloudflareEnv });
  const createdDatabase = listDatabases().find((database) => database.name === target.d1.databaseName);
  if (!createdDatabase) fail("D1 创建完成，但无法从目标账号重新查询到该数据库");
  databaseId = requiredString(createdDatabase.uuid, "新建 D1 UUID");
}

if (!dryRun && target.d1.databaseId !== databaseId) {
  rawTarget.d1.databaseId = databaseId;
  await writeFile(targetFile, `${JSON.stringify(rawTarget, null, 2)}\n`, "utf8");
  console.log(`已将 D1 UUID 回写到 ${path.relative(PROJECT_ROOT, targetFile)}。`);
}

run("npm", ["run", "build"], {
  env: {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: target.accountId,
    D1_DATABASE_ID: databaseId,
    ...target.vars,
  },
});

const generated = JSON.parse(await readFile(GENERATED_CONFIG, "utf8"));
const deployConfigPath = path.join(
  PROJECT_ROOT,
  "dist",
  "server",
  `wrangler.${targetName}.json`,
);

const deployConfig = {
  ...generated,
  name: target.workerName,
  account_id: target.accountId,
  vars: target.vars,
  d1_databases: [
    {
      binding: "DB",
      database_name: target.d1.databaseName,
      database_id: databaseId,
      migrations_dir: path.relative(path.dirname(deployConfigPath), path.join(PROJECT_ROOT, "drizzle")),
    },
  ],
};
if (target.routes !== undefined) deployConfig.routes = target.routes;

await mkdir(path.dirname(deployConfigPath), { recursive: true });
await writeFile(deployConfigPath, `${JSON.stringify(deployConfig, null, 2)}\n`, "utf8");

if (target.runMigrations && !skipMigrations && !dryRun) {
  console.log("将以非交互模式应用 D1 迁移（Wrangler 仍会在执行前创建备份）。");
  run("npx", [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    target.d1.databaseName,
    "--remote",
    "--config",
    deployConfigPath,
  ], { env: { ...cloudflareEnv, CI: "true" } });
}

run("npx", [
  "wrangler",
  "deploy",
  "--config",
  deployConfigPath,
  "--keep-vars",
  ...(dryRun ? ["--dry-run"] : []),
], { env: cloudflareEnv });

if (!dryRun) {
  run("npx", [
    "wrangler",
    "secret",
    "bulk",
    "--config",
    deployConfigPath,
  ], {
    env: cloudflareEnv,
    input: `${JSON.stringify(workerSecrets)}\n`,
  });
}

console.log(dryRun ? "\n目标配置与部署产物验证完成。" : "\n目标部署完成。");
