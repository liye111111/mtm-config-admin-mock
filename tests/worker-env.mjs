import { DatabaseSync } from "node:sqlite";

// 内存 SQLite 模拟 D1 的参数绑定和 batch 事务，不读取项目凭据或实际数据库。
export const sqlite = new DatabaseSync(":memory:");
export const faults = { writes: false };
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
  async run() {
    if (faults.writes && /^\s*(INSERT|UPDATE|DELETE)/i.test(this.sql)) throw new Error("simulated storage failure");
    const result = sqlite.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}
export const env = {
  DB: {
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  },
  SHOPIFY_CLIENT_ID: "unit-test-client",
  SHOPIFY_CLIENT_SECRET: "unit-test-secret-not-a-real-credential",
  SHOPIFY_ADMIN_ACCESS_TOKEN: "unit-test-token-not-a-real-credential",
  SHOPIFY_STORE: "unit-test.myshopify.com",
};
