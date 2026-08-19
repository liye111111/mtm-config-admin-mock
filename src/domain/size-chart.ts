export type SizeChartStatus = "active" | "disabled";
export type SizeChartVersionStatus = "draft" | "published" | "archived";
export type SizeRecommendationAlgorithmCode = "range_matrix" | "nearest_profile" | "direct_lookup";

export type SizeDefinition = { code: string; label: string; sortOrder: number };
export type SizeChartInputAttribute = { attributeCode: string; required: boolean; weight?: number };
export type RangeMatrixRow = { id: string; ranges: Record<string, { min: number; max: number }>; sizeCode: string };
export type NearestProfile = { sizeCode: string; measurements: Record<string, number> };
export type DirectLookupRow = { min: number; max: number; sizeCode: string };

export type RangeMatrixConfig = {
  schemaVersion: 1;
  algorithm: { code: "range_matrix"; version: 1 };
  inputAttributes: SizeChartInputAttribute[];
  sizes: SizeDefinition[];
  data: { rows: RangeMatrixRow[] };
};

export type NearestProfileConfig = {
  schemaVersion: 1;
  algorithm: { code: "nearest_profile"; version: 1 };
  inputAttributes: SizeChartInputAttribute[];
  sizes: SizeDefinition[];
  data: { profiles: NearestProfile[]; maxDistance: number };
};

export type DirectLookupConfig = {
  schemaVersion: 1;
  algorithm: { code: "direct_lookup"; version: 1 };
  inputAttributes: SizeChartInputAttribute[];
  sizes: SizeDefinition[];
  data: { attributeCode: string; mappings: DirectLookupRow[] };
};

export type SizeChartConfig = RangeMatrixConfig | NearestProfileConfig | DirectLookupConfig;

export type SizeChartView = {
  id: string;
  shopId: string;
  code: string;
  name: string;
  description?: string;
  status: SizeChartStatus;
  currentVersionId: string | null;
  currentVersion: number | null;
  draftVersionId: string | null;
  draftVersion: number | null;
  draftConfig: SizeChartConfig | null;
  createdAt: string;
  updatedAt: string;
};

export type SizeChartVersionView = {
  id: string;
  sizeChartId: string;
  version: number;
  status: SizeChartVersionStatus;
  algorithmCode: SizeRecommendationAlgorithmCode;
  algorithmVersion: number;
  config: SizeChartConfig;
  createdAt: string;
  publishedAt: string | null;
};

export type ProductTypeSizeChartBindingView = {
  id: string;
  productType: string;
  sizeChartId: string;
  sizeChartName: string;
  sizeChartCode: string;
  createdAt: string;
  updatedAt: string;
};

export const sizeRecommendationAlgorithms = {
  range_matrix: {
    name: "区间矩阵",
    summary: "按多个量体属性的区间组合匹配尺码，适合身高 × 体重等客户尺码表。",
    calculation: ["依次检查每一行的全部量体区间，边界值包含在区间内。", "仅当一行的全部区间都命中时，该行才是候选尺码。", "多行命中时，选择输入值距离各区间中心加权距离最小的一行；仍相同则采用表格中靠前的行。", "没有任何行命中时返回无法推荐，不自动改推相邻尺码。"],
  },
  nearest_profile: {
    name: "标准画像近邻",
    summary: "将用户量体与各尺码的标准量体画像比较，适合胸围、肩宽等多维推荐。",
    calculation: ["每个输入属性先按量体元数据转换为标准单位。", "计算输入值与每个尺码标准值的差，再乘以该属性权重。", "选择加权距离最小的尺码；距离相同则按尺码排序选择。", "最小距离超过最大容差时返回无法推荐。"],
  },
  direct_lookup: {
    name: "单属性直接映射",
    summary: "使用一个量体属性的固定区间直接映射尺码，适合领围、鞋长等场景。",
    calculation: ["读取指定的唯一量体属性，并按标准单位处理。", "从上到下查找包含输入值的映射区间，区间包含边界。", "第一条命中的映射即为推荐结果，因此区间不能重叠。", "缺少输入或没有区间命中时返回无法推荐。"],
  },
} as const;
