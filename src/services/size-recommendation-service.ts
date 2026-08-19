import type { SizeChartConfig, SizeChartInputAttribute } from "@/src/domain";
import { getShopifyProductType } from "@/src/integrations/shopify-admin";
import { normalizeProductType } from "@/src/repositories/product-type-size-chart-binding-repository";
import * as sizeCharts from "@/src/repositories/size-chart-repository";
import type { SizeRecommendationInput } from "@/src/schemas/storefront";
import { parseSizeChartConfig } from "@/src/schemas/size-chart";

type Basis = { attributeCode: string; input: number; min?: number; max?: number; target?: number; weight?: number };
type Candidate = { sizeCode: string; score: number; basis: Basis[]; rowIndex: number };
type Reason = "recommended" | "product_type_missing" | "size_chart_unavailable" | "missing_required_measurements" | "no_rule_matched" | "recommended_size_unavailable";

function result(reason: Reason, messages: string[], details: Record<string, unknown> = {}, recommendedSize: string | null = null, basis: Basis[] = []) {
  return { recommendationVersion: 1, recommendedSize, reason, basis, hint: { level: recommendedSize ? "success" : "info", messages }, ...details };
}

function missingAttributes(attributes: SizeChartInputAttribute[], measurements: Record<string, number>) {
  return attributes.filter((item) => item.required && measurements[item.attributeCode] == null).map((item) => item.attributeCode);
}

function rangeMatrix(config: Extract<SizeChartConfig, { algorithm: { code: "range_matrix" } }>, measurements: Record<string, number>): Candidate | null {
  const weights = new Map(config.inputAttributes.map((item) => [item.attributeCode, item.weight ?? 1]));
  const candidates = config.data.rows.flatMap((row, rowIndex) => {
    const entries = Object.entries(row.ranges);
    if (!entries.length || entries.some(([code, range]) => measurements[code] == null || measurements[code] < range.min || measurements[code] > range.max)) return [];
    const basis = entries.map(([attributeCode, range]) => ({ attributeCode, input: measurements[attributeCode], min: range.min, max: range.max, weight: weights.get(attributeCode) ?? 1 }));
    const score = basis.reduce((total, item) => {
      const width = Math.max(item.max - item.min, 1);
      return total + Math.abs(item.input - (item.min + item.max) / 2) / width * item.weight;
    }, 0);
    return [{ sizeCode: row.sizeCode, score, basis, rowIndex }];
  });
  return candidates.sort((left, right) => left.score - right.score || left.rowIndex - right.rowIndex)[0] ?? null;
}

function directLookup(config: Extract<SizeChartConfig, { algorithm: { code: "direct_lookup" } }>, measurements: Record<string, number>): Candidate | null {
  const input = measurements[config.data.attributeCode];
  const rowIndex = config.data.mappings.findIndex((row) => input >= row.min && input <= row.max);
  if (rowIndex < 0) return null;
  const row = config.data.mappings[rowIndex];
  return { sizeCode: row.sizeCode, score: 0, rowIndex, basis: [{ attributeCode: config.data.attributeCode, input, min: row.min, max: row.max }] };
}

function nearestProfile(config: Extract<SizeChartConfig, { algorithm: { code: "nearest_profile" } }>, measurements: Record<string, number>): Candidate | null {
  const weights = new Map(config.inputAttributes.map((item) => [item.attributeCode, item.weight ?? 1]));
  const candidates = config.data.profiles.map((profile, rowIndex) => {
    const basis = Object.entries(profile.measurements).filter(([code]) => measurements[code] != null)
      .map(([attributeCode, target]) => ({ attributeCode, input: measurements[attributeCode], target, weight: weights.get(attributeCode) ?? 1 }));
    const score = Math.sqrt(basis.reduce((total, item) => total + ((item.input - item.target) * item.weight) ** 2, 0));
    return { sizeCode: profile.sizeCode, score, basis, rowIndex };
  }).sort((left, right) => left.score - right.score || left.rowIndex - right.rowIndex);
  return candidates[0] && candidates[0].score <= config.data.maxDistance ? candidates[0] : null;
}

function recommend(config: SizeChartConfig, measurements: Record<string, number>) {
  if (config.algorithm.code === "range_matrix") return rangeMatrix(config, measurements);
  if (config.algorithm.code === "direct_lookup") return directLookup(config, measurements);
  return nearestProfile(config, measurements);
}

function basisHints(basis: Basis[]) {
  return basis.map((item) => item.min != null
    ? `${item.attributeCode}: ${item.input} 命中 [${item.min}, ${item.max}]`
    : `${item.attributeCode}: ${item.input}，标准值 ${item.target}`);
}

export async function recommendSize(shopId: string, input: SizeRecommendationInput) {
  const productType = await getShopifyProductType(shopId, input.productId);
  if (!productType) return result("product_type_missing", ["商品未设置 Shopify 自定义分类，无法定位尺码表。"]);
  const chart = await sizeCharts.findPublishedSizeChartByProductType(shopId, normalizeProductType(productType));
  if (!chart) return result("size_chart_unavailable", [`商品分类“${productType}”未绑定已启用且已发布的尺码表。`], { productType });
  const config = parseSizeChartConfig(JSON.parse(chart.config_json));
  const missing = missingAttributes(config.inputAttributes, input.measurements);
  if (missing.length) return result("missing_required_measurements", [`尺码表“${chart.name}”缺少必填量体字段：${missing.join("、")}。`], { productType, sizeChartCode: chart.code, sizeChartVersion: chart.version, missingAttributes: missing });
  const candidate = recommend(config, input.measurements);
  if (!candidate) return result("no_rule_matched", [`已使用尺码表“${chart.name}”v${chart.version}，但没有规则匹配当前量体数据。`, `算法：${config.algorithm.code}@${config.algorithm.version}`], { productType, sizeChartCode: chart.code, sizeChartVersion: chart.version });
  const details = { productType, sizeChartCode: chart.code, sizeChartVersion: chart.version, algorithm: `${config.algorithm.code}@${config.algorithm.version}`, score: candidate.score };
  if (!input.availableSizes.includes(candidate.sizeCode)) return result("recommended_size_unavailable", [`理论推荐尺码：${candidate.sizeCode}，但当前商品没有该尺码选项，未自动选中。`, ...basisHints(candidate.basis)], { ...details, theoreticalSize: candidate.sizeCode }, null, candidate.basis);
  return result("recommended", [`推荐尺码：${candidate.sizeCode}`, `尺码表：${chart.name} v${chart.version}`, ...basisHints(candidate.basis)], details, candidate.sizeCode, candidate.basis);
}
