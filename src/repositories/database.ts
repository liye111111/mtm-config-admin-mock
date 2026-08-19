import { env } from "cloudflare:workers";

const seedConfig = {
  schemaVersion: 2,
  buttonLabel: "开始定制",
  pricingMode: "none",
  templateType: "single",
  orderLineMode: "single_line",
  components: [],
  steps: [
    { id: "jacket", code: "jacket", title: "西服上衣", type: "options", displayType: "radio", required: true, enabled: true, sortOrder: 0, options: [] },
    { id: "measure", code: "measurements", title: "量体尺寸", type: "measurements", required: true, enabled: true, sortOrder: 1, options: [] },
    { id: "review", code: "review", title: "配置确认", type: "review", required: true, enabled: true, sortOrder: 2, options: [] },
  ],
  measurementBlocks: [{
    id: "body-measurements", code: "body_measurements", name: "身体尺寸", applicableCategories: ["jacket"], enabled: true, sortOrder: 0,
    fields: [
      { id: "height", attributeId: "measurement:local-dev.myshopify.com:height", inputUnit: "CM", min: 140, max: 210, step: 1, required: true, enabled: true, sortOrder: 0 },
      { id: "weight", attributeId: "measurement:local-dev.myshopify.com:weight", inputUnit: "KG", min: 40, max: 180, step: 1, required: true, enabled: true, sortOrder: 1 },
      { id: "sleeve-length", attributeId: "measurement:local-dev.myshopify.com:sleeve_length", inputUnit: "CM", min: 40, max: 90, step: 0.5, required: true, enabled: true, sortOrder: 2 },
    ],
  }],
};

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
    db.prepare("CREATE TABLE IF NOT EXISTS template_categories (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS measurement_attributes (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, description TEXT, value_type TEXT NOT NULL, dimension TEXT NOT NULL, canonical_unit TEXT NOT NULL, precision INTEGER NOT NULL DEFAULT 1, aliases_json TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(shop_id,code))"),
    db.prepare("CREATE TABLE IF NOT EXISTS size_charts (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')), current_version_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(shop_id,code))"),
    db.prepare("CREATE TABLE IF NOT EXISTS size_chart_versions (id TEXT PRIMARY KEY, size_chart_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published','archived')), algorithm_code TEXT NOT NULL CHECK(algorithm_code IN ('range_matrix','nearest_profile','direct_lookup')), algorithm_version INTEGER NOT NULL, config_json TEXT NOT NULL, created_at TEXT NOT NULL, published_at TEXT, FOREIGN KEY(size_chart_id) REFERENCES size_charts(id), UNIQUE(size_chart_id,version))"),
    db.prepare("CREATE TABLE IF NOT EXISTS product_type_size_chart_bindings (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, product_type TEXT NOT NULL, normalized_product_type TEXT NOT NULL, size_chart_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(size_chart_id) REFERENCES size_charts(id), UNIQUE(shop_id,normalized_product_type))"),
    db.prepare("CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1, schema_version INTEGER NOT NULL DEFAULT 2, config_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS template_versions (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, version INTEGER NOT NULL, schema_version INTEGER NOT NULL DEFAULT 2, config_json TEXT NOT NULL, published_at TEXT NOT NULL, UNIQUE(template_id,version))"),
    db.prepare("CREATE TABLE IF NOT EXISTS product_bindings (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, shopify_product_gid TEXT NOT NULL, shopify_product_id TEXT NOT NULL, product_title TEXT NOT NULL, product_handle TEXT, product_image_url TEXT, product_image_alt TEXT, product_status TEXT NOT NULL, product_kind TEXT NOT NULL, product_type TEXT, variant_count INTEGER NOT NULL DEFAULT 0, online_store_url TEXT, shopify_admin_url TEXT, template_id TEXT NOT NULL, published_version INTEGER, enabled INTEGER NOT NULL DEFAULT 1, sync_status TEXT NOT NULL DEFAULT 'synced', sync_error TEXT, shopify_updated_at TEXT, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(shop_id,shopify_product_gid), UNIQUE(shop_id,shopify_product_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS customization_instances (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, shopify_product_id TEXT NOT NULL, shopify_variant_id TEXT NOT NULL, shopify_sku TEXT, template_id TEXT NOT NULL, template_code TEXT NOT NULL, template_version INTEGER NOT NULL, schema_version INTEGER NOT NULL, status TEXT NOT NULL, selection_snapshot_json TEXT NOT NULL, component_snapshot_json TEXT NOT NULL, measurement_snapshot_json TEXT NOT NULL, summary TEXT NOT NULL, idempotency_key TEXT NOT NULL, customer_id TEXT, cart_token_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(shop_id,idempotency_key))"),
    db.prepare("CREATE TABLE IF NOT EXISTS measurement_profiles (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, customer_id TEXT, customer_email TEXT, customer_name TEXT, guest_id_hash TEXT, unit TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1, measurements_json TEXT NOT NULL, expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK ((customer_id IS NOT NULL AND guest_id_hash IS NULL) OR (customer_id IS NULL AND guest_id_hash IS NOT NULL)))"),
    db.prepare("CREATE TABLE IF NOT EXISTS order_webhook_snapshots (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, webhook_id TEXT NOT NULL UNIQUE, topic TEXT NOT NULL, shopify_order_id TEXT, payload_json TEXT NOT NULL, status TEXT NOT NULL, error TEXT, received_at TEXT NOT NULL, processed_at TEXT)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS measurement_profiles_customer_idx ON measurement_profiles(shop_id,customer_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS measurement_profiles_guest_idx ON measurement_profiles(shop_id,guest_id_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS measurement_profiles_expiry_idx ON measurement_profiles(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS order_webhook_snapshots_order_idx ON order_webhook_snapshots(shop_id,shopify_order_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS measurement_attributes_shop_status_idx ON measurement_attributes(shop_id,enabled)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS size_chart_versions_one_draft_idx ON size_chart_versions(size_chart_id) WHERE status='draft'"),
    db.prepare("CREATE INDEX IF NOT EXISTS size_chart_versions_status_idx ON size_chart_versions(size_chart_id,status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS product_type_size_chart_bindings_chart_idx ON product_type_size_chart_bindings(shop_id,size_chart_id)"),
  ]);
  const profileColumns = await db.prepare("PRAGMA table_info(measurement_profiles)").all<{ name: string }>();
  if (!profileColumns.results.some((column) => column.name === "customer_email")) await db.prepare("ALTER TABLE measurement_profiles ADD COLUMN customer_email TEXT").run();
  if (!profileColumns.results.some((column) => column.name === "customer_name")) await db.prepare("ALTER TABLE measurement_profiles ADD COLUMN customer_name TEXT").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS measurement_profiles_email_idx ON measurement_profiles(shop_id,customer_email)").run();
  const productBindingColumns = await db.prepare("PRAGMA table_info(product_bindings)").all<{ name: string }>();
  if (!productBindingColumns.results.some((column) => column.name === "product_type")) await db.prepare("ALTER TABLE product_bindings ADD COLUMN product_type TEXT").run();
  const categoryCount = await db.prepare("SELECT COUNT(*) count FROM template_categories").first<{count:number}>();
  if (!categoryCount?.count) {
    const now = new Date().toISOString();
    const seeds = [{code:"suit",name:"套装",sortOrder:10},{code:"jacket",name:"西服",sortOrder:20},{code:"trousers",name:"西裤",sortOrder:30},{code:"shirt",name:"衬衫",sortOrder:40},{code:"waistcoat",name:"马甲",sortOrder:50},{code:"curtain",name:"窗帘",sortOrder:60}];
    await db.batch(seeds.map(({code,name,sortOrder}) => db.prepare("INSERT INTO template_categories (id,code,name,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(`category-${code}`,code,name,sortOrder,now,now)));
  }
  const columns = await db.prepare("PRAGMA table_info(templates)").all<{ name: string }>();
  if (!columns.results.some((column: { name: string }) => column.name === "category")) await db.prepare("ALTER TABLE templates ADD COLUMN category TEXT NOT NULL DEFAULT '西服'").run();
  if (!columns.results.some((column: { name: string }) => column.name === "schema_version")) await db.prepare("ALTER TABLE templates ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 2").run();
  const versionColumns = await db.prepare("PRAGMA table_info(template_versions)").all<{ name: string }>();
  if (!versionColumns.results.some((column: { name: string }) => column.name === "schema_version")) await db.prepare("ALTER TABLE template_versions ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 2").run();
  await db.prepare("UPDATE templates SET category=status, status=CAST(version AS TEXT), version=CAST(config_json AS INTEGER), config_json=created_at, created_at=updated_at, updated_at=category WHERE status NOT IN ('draft','published') AND json_valid(created_at)=1").run();
  const count = await db.prepare("SELECT COUNT(*) count FROM templates").first<{ count: number }>();
  if (count?.count) return;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO templates (id,code,name,category,status,version,schema_version,config_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("mens-suit-v1", "mens_suit_v1", "男士西服定制", "jacket", "published", 1, 2, JSON.stringify(seedConfig), now, now),
    db.prepare("INSERT INTO template_versions (id,template_id,version,schema_version,config_json,published_at) VALUES (?,?,?,?,?,?)").bind("mens-suit-v1-v1", "mens-suit-v1", 1, 2, JSON.stringify(seedConfig), now),
    db.prepare("INSERT INTO product_bindings (id,shop_id,shopify_product_gid,shopify_product_id,product_title,product_handle,product_status,product_kind,variant_count,shopify_admin_url,template_id,published_version,enabled,sync_status,last_synced_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind("binding-poc", "local-dev.myshopify.com", "gid://shopify/Product/10296845205799", "10296845205799", "MTM POC 定制西服", "mtm-poc-定制西服", "ACTIVE", "single", 1, "https://admin.shopify.com/store/local-dev/products/10296845205799", "mens-suit-v1", 1, 1, "synced", now, now, now),
  ]);
}
