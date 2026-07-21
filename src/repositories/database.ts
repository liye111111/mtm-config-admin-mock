import { env } from "cloudflare:workers";

const seedConfig = { buttonLabel: "开始定制", pricingMode: "none", steps: [{ id: "fabric", code: "fabric_fit", title: "面料与版型", type: "variant" }, { id: "jacket", code: "jacket", title: "西服上衣", type: "options" }, { id: "trousers", code: "trousers", title: "西裤款式", type: "options" }, { id: "measure", code: "measurements", title: "量体尺寸", type: "measurements" }, { id: "review", code: "review", title: "配置确认", type: "review" }], measurementFields: [{ code: "height", name: "身高", unit: "CM", min: 140, max: 210, step: 1 }, { code: "weight", name: "体重", unit: "KG", min: 40, max: 180, step: 1 }, { code: "sleeve_length", name: "袖长", unit: "CM", min: 40, max: 90, step: 0.5 }, { code: "trouser_length", name: "裤长", unit: "CM", min: 80, max: 130, step: 0.5 }, { code: "waist", name: "腰围", unit: "CM", min: 50, max: 160, step: 0.5 }] };

export function database() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

let initialized: Promise<void> | undefined;
export function ensureDatabase() {
  initialized ??= initializeDatabase().catch((error) => { initialized = undefined; throw error; });
  return initialized;
}

async function initializeDatabase() {
  const db = database();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1, config_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS template_versions (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, version INTEGER NOT NULL, config_json TEXT NOT NULL, published_at TEXT NOT NULL, UNIQUE(template_id,version))"),
    db.prepare("CREATE TABLE IF NOT EXISTS product_bindings (id TEXT PRIMARY KEY, shopify_product_id TEXT NOT NULL UNIQUE, product_title TEXT NOT NULL, product_handle TEXT, template_id TEXT NOT NULL, published_version INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
  ]);
  const columns = await db.prepare("PRAGMA table_info(templates)").all<{ name: string }>();
  if (!columns.results.some((column: { name: string }) => column.name === "category")) await db.prepare("ALTER TABLE templates ADD COLUMN category TEXT NOT NULL DEFAULT '西服'").run();
  await db.prepare("UPDATE templates SET category=status, status=CAST(version AS TEXT), version=CAST(config_json AS INTEGER), config_json=created_at, created_at=updated_at, updated_at=category WHERE status NOT IN ('draft','published') AND json_valid(created_at)=1").run();
  const count = await db.prepare("SELECT COUNT(*) count FROM templates").first<{ count: number }>();
  if (count?.count) return;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO templates (id,code,name,category,status,version,config_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind("mens-suit-v1", "mens_suit_v1", "男士西服定制", "西服", "published", 1, JSON.stringify(seedConfig), now, now),
    db.prepare("INSERT INTO template_versions (id,template_id,version,config_json,published_at) VALUES (?,?,?,?,?)").bind("mens-suit-v1-v1", "mens-suit-v1", 1, JSON.stringify(seedConfig), now),
    db.prepare("INSERT INTO product_bindings (id,shopify_product_id,product_title,product_handle,template_id,published_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind("binding-poc", "10296845205799", "MTM POC 定制西服", "mtm-poc-定制西服", "mens-suit-v1", 1, now, now),
  ]);
}
