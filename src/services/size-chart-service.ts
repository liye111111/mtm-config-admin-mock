import type { DirectLookupConfig, NearestProfileConfig, RangeMatrixConfig, SizeChartConfig, SizeChartRow, SizeChartVersionRow, SizeChartVersionView, SizeChartView } from "@/src/domain";
import type { CreateSizeChartInput, UpdateSizeChartInput } from "@/src/schemas/size-chart";
import { parseSizeChartConfig } from "@/src/schemas/size-chart";
import { AppError, NotFoundError } from "@/src/shared/errors";
import * as charts from "@/src/repositories/size-chart-repository";
import * as attributes from "@/src/repositories/measurement-attribute-repository";

const initialConfig: SizeChartConfig = {
  schemaVersion: 1,
  algorithm: { code: "range_matrix", version: 1 },
  inputAttributes: [],
  sizes: [],
  data: { rows: [] },
};

function parseStoredConfig(value: string): SizeChartConfig {
  try { return JSON.parse(value) as SizeChartConfig; }
  catch { throw new AppError("尺码表配置存储格式无效", 500); }
}

function chartView(row: SizeChartRow): SizeChartView {
  return {
    id: row.id, shopId: row.shop_id, code: row.code, name: row.name, description: row.description || undefined, status: row.status,
    currentVersionId: row.current_version_id, currentVersion: row.current_version ?? null,
    draftVersionId: row.draft_version_id ?? null, draftVersion: row.draft_version ?? null,
    draftConfig: row.draft_config_json ? parseStoredConfig(row.draft_config_json) : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function versionView(row: SizeChartVersionRow): SizeChartVersionView {
  return { id: row.id, sizeChartId: row.size_chart_id, version: row.version, status: row.status, algorithmCode: row.algorithm_code, algorithmVersion: row.algorithm_version, config: parseStoredConfig(row.config_json), createdAt: row.created_at, publishedAt: row.published_at };
}

async function validateReferences(shopId: string, config: SizeChartConfig) {
  if (!config.inputAttributes.length) throw new AppError("至少选择一个量体属性", 422);
  if (!config.sizes.length) throw new AppError("至少定义一个可推荐尺码", 422);
  if (config.sizes.some((size) => !size.code || !size.label)) throw new AppError("尺码编码和名称不能为空", 422);
  const enabled = await attributes.listMeasurementAttributes(shopId, { search: "", dimension: "all", status: "enabled" });
  const codes = new Set(enabled.map((attribute) => attribute.code));
  const missing = config.inputAttributes.map((item) => item.attributeCode).filter((code) => !codes.has(code));
  if (missing.length) throw new AppError(`量体属性不存在或已停用：${[...new Set(missing)].join("、")}`, 422);
  const inputCodes = new Set(config.inputAttributes.map((item) => item.attributeCode));
  const sizeCodes = new Set(config.sizes.map((item) => item.code));
  if (inputCodes.size !== config.inputAttributes.length) throw new AppError("输入量体属性不能重复", 422);
  if (sizeCodes.size !== config.sizes.length) throw new AppError("尺码编码不能重复", 422);
  if (config.algorithm.code === "range_matrix") {
    const rows = (config as RangeMatrixConfig).data.rows;
    if (!rows.length) throw new AppError("区间矩阵至少需要一行数据", 422);
    for (const row of rows) {
      if (!sizeCodes.has(row.sizeCode)) throw new AppError(`区间行引用了未定义尺码：${row.sizeCode}`, 422);
      const missingRanges = config.inputAttributes.filter((item) => item.required && !row.ranges[item.attributeCode]);
      if (missingRanges.length) throw new AppError(`区间行缺少必填属性：${missingRanges.map((item) => item.attributeCode).join("、")}`, 422);
    }
  }
  if (config.algorithm.code === "nearest_profile") {
    const profiles = (config as NearestProfileConfig).data.profiles;
    if (!profiles.length) throw new AppError("至少配置一个标准尺码画像", 422);
    for (const profile of profiles) {
      if (!sizeCodes.has(profile.sizeCode)) throw new AppError(`标准画像引用了未定义尺码：${profile.sizeCode}`, 422);
      const missingMeasurements = config.inputAttributes.filter((item) => item.required && profile.measurements[item.attributeCode] === undefined);
      if (missingMeasurements.length) throw new AppError(`尺码 ${profile.sizeCode} 的标准画像缺少：${missingMeasurements.map((item) => item.attributeCode).join("、")}`, 422);
    }
  }
  if (config.algorithm.code === "direct_lookup") {
    const data = (config as DirectLookupConfig).data;
    if (!data.mappings.length) throw new AppError("直接映射至少需要一行数据", 422);
    if (config.inputAttributes.length !== 1) throw new AppError("直接映射算法只能使用一个量体属性", 422);
    if (!inputCodes.has(data.attributeCode)) throw new AppError("直接映射属性必须在输入属性中", 422);
    const sorted = [...data.mappings].sort((a, b) => a.min - b.min);
    for (let index = 0; index < sorted.length; index += 1) {
      if (!sizeCodes.has(sorted[index].sizeCode)) throw new AppError(`映射引用了未定义尺码：${sorted[index].sizeCode}`, 422);
      if (index > 0 && sorted[index].min <= sorted[index - 1].max) throw new AppError("直接映射区间不能重叠", 422);
    }
  }
}

export async function getSizeCharts(shopId: string) { return (await charts.listSizeCharts(shopId)).map(chartView); }
export async function getSizeChart(shopId: string, id: string) { const row = await charts.findSizeChart(id, shopId); if (!row) throw new NotFoundError("尺码表不存在"); return chartView(row); }
export async function createSizeChart(shopId: string, input: CreateSizeChartInput) {
  if (await charts.findSizeChartByCode(input.code, shopId)) throw new AppError("尺码表编码已存在", 409);
  const row = await charts.createSizeChart(shopId, input, JSON.stringify(initialConfig), "range_matrix");
  if (!row) throw new AppError("尺码表创建失败", 500);
  return chartView(row);
}
export async function saveSizeChart(shopId: string, id: string, input: UpdateSizeChartInput) {
  if (!await charts.findSizeChart(id, shopId)) throw new NotFoundError("尺码表不存在");
  if (!await charts.findDraft(id)) throw new AppError("尺码表没有可编辑草稿", 409);
  const row = await charts.updateSizeChart(id, shopId, input);
  if (!row) throw new NotFoundError("尺码表不存在");
  return chartView(row);
}
export async function getSizeChartVersions(shopId: string, id: string) { await getSizeChart(shopId, id); return (await charts.listSizeChartVersions(id)).map(versionView); }
export async function publishSizeChart(shopId: string, id: string) {
  await getSizeChart(shopId, id);
  const draft = await charts.findDraft(id);
  if (!draft) throw new AppError("尺码表没有可发布草稿", 409);
  const config = parseSizeChartConfig(parseStoredConfig(draft.config_json));
  await validateReferences(shopId, config);
  await charts.publishDraft(id, draft.id, draft.version);
  return getSizeChart(shopId, id);
}
export async function removeSizeChart(shopId: string, id: string) {
  const chart = await getSizeChart(shopId, id);
  if (chart.currentVersionId) throw new AppError("已发布尺码表不能删除，请停用后保留历史版本", 409);
  await charts.deleteSizeChart(id, shopId);
}
