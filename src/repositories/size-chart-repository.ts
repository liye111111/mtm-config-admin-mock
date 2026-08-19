import type { CreateSizeChartInput, UpdateSizeChartInput } from "@/src/schemas/size-chart";
import type { SizeChartRow, SizeChartVersionRow } from "@/src/domain";
import { database, ensureDatabase } from "./database";

const chartSelect = `SELECT c.*,
  published.version current_version,
  draft.id draft_version_id,
  draft.version draft_version,
  draft.config_json draft_config_json
FROM size_charts c
LEFT JOIN size_chart_versions published ON published.id=c.current_version_id
LEFT JOIN size_chart_versions draft ON draft.size_chart_id=c.id AND draft.status='draft'`;

export async function listSizeCharts(shopId: string) {
  await ensureDatabase();
  return (await database().prepare(`${chartSelect} WHERE c.shop_id=? ORDER BY c.updated_at DESC`).bind(shopId).all<SizeChartRow>()).results;
}

export async function findSizeChart(id: string, shopId: string) {
  await ensureDatabase();
  return database().prepare(`${chartSelect} WHERE c.id=? AND c.shop_id=?`).bind(id, shopId).first<SizeChartRow>();
}

export async function findSizeChartByCode(code: string, shopId: string) {
  await ensureDatabase();
  return database().prepare("SELECT * FROM size_charts WHERE code=? AND shop_id=?").bind(code, shopId).first<SizeChartRow>();
}

export async function findPublishedSizeChartByProductType(shopId: string, normalizedProductType: string) {
  await ensureDatabase();
  return database().prepare(`SELECT c.id,c.code,c.name,c.status,v.id version_id,v.version,v.algorithm_code,v.algorithm_version,v.config_json
    FROM product_type_size_chart_bindings b
    JOIN size_charts c ON c.id=b.size_chart_id AND c.shop_id=b.shop_id
    JOIN size_chart_versions v ON v.id=c.current_version_id AND v.status='published'
    WHERE b.shop_id=? AND b.normalized_product_type=? AND c.status='active'`)
    .bind(shopId, normalizedProductType).first<{
      id: string; code: string; name: string; status: "active"; version_id: string; version: number;
      algorithm_code: string; algorithm_version: number; config_json: string;
    }>();
}

export async function createSizeChart(shopId: string, input: CreateSizeChartInput, configJson: string, algorithmCode: string) {
  await ensureDatabase();
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  await database().batch([
    database().prepare("INSERT INTO size_charts (id,shop_id,code,name,description,status,current_version_id,created_at,updated_at) VALUES (?,?,?,?,?,'active',NULL,?,?)").bind(id, shopId, input.code, input.name, input.description || null, now, now),
    database().prepare("INSERT INTO size_chart_versions (id,size_chart_id,version,status,algorithm_code,algorithm_version,config_json,created_at,published_at) VALUES (?,?,1,'draft',?,1,?,?,NULL)").bind(versionId, id, algorithmCode, configJson, now),
  ]);
  return findSizeChart(id, shopId);
}

export async function updateSizeChart(id: string, shopId: string, input: UpdateSizeChartInput) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await database().batch([
    database().prepare("UPDATE size_charts SET name=?,description=?,status=?,updated_at=? WHERE id=? AND shop_id=?").bind(input.name, input.description || null, input.status, now, id, shopId),
    database().prepare("UPDATE size_chart_versions SET algorithm_code=?,algorithm_version=?,config_json=? WHERE size_chart_id=? AND status='draft'").bind(input.config.algorithm.code, input.config.algorithm.version, JSON.stringify(input.config), id),
  ]);
  return findSizeChart(id, shopId);
}

export async function listSizeChartVersions(id: string) {
  await ensureDatabase();
  return (await database().prepare("SELECT * FROM size_chart_versions WHERE size_chart_id=? ORDER BY version DESC").bind(id).all<SizeChartVersionRow>()).results;
}

export async function findDraft(id: string) {
  await ensureDatabase();
  return database().prepare("SELECT * FROM size_chart_versions WHERE size_chart_id=? AND status='draft'").bind(id).first<SizeChartVersionRow>();
}

export async function publishDraft(chartId: string, draftId: string, version: number) {
  const now = new Date().toISOString();
  await database().batch([
    database().prepare("UPDATE size_chart_versions SET status='archived' WHERE size_chart_id=? AND status='published'").bind(chartId),
    database().prepare("UPDATE size_chart_versions SET status='published',published_at=? WHERE id=? AND status='draft'").bind(now, draftId),
    database().prepare("UPDATE size_charts SET current_version_id=?,updated_at=? WHERE id=?").bind(draftId, now, chartId),
    database().prepare("INSERT INTO size_chart_versions (id,size_chart_id,version,status,algorithm_code,algorithm_version,config_json,created_at,published_at) SELECT ?,size_chart_id,?,'draft',algorithm_code,algorithm_version,config_json,?,NULL FROM size_chart_versions WHERE id=?").bind(crypto.randomUUID(), version + 1, now, draftId),
  ]);
}

export async function deleteSizeChart(id: string, shopId: string) {
  await ensureDatabase();
  await database().batch([
    database().prepare("DELETE FROM size_chart_versions WHERE size_chart_id=? AND EXISTS (SELECT 1 FROM size_charts WHERE id=? AND shop_id=? AND current_version_id IS NULL)").bind(id, id, shopId),
    database().prepare("DELETE FROM size_charts WHERE id=? AND shop_id=? AND current_version_id IS NULL").bind(id, shopId),
  ]);
}
