# 量体尺码推荐实现方案

## 1. 背景与目标

当前项目已经打通“读取已保存量体资料 → 调用推荐接口 → Theme 自动选码 → 显示推荐提示”链路，但服务端尚未执行真实尺码计算。`POST /api/storefront/size-recommendation` 目前使用随机数从 Theme 提交的可售尺码中选择一个结果，量体值并未参与推荐。

本方案的目标是：

- 先建立店铺级量体属性元数据字典，统一字段编码、数据类型、物理维度和标准单位；
- 用可配置、可发布、可追溯的尺码表替换随机 Mock；
- 建立通用推荐引擎，允许每个类目独立选择和配置算法；
- 使用确定性、可解释的决策表、直接映射或加权距离完成推荐；
- 保留现有 Theme 接口路径和主要响应字段，降低前端改造范围；
- 支持不同品类、版型或商品绑定不同的尺码规则；
- 推荐失败或数据不足时，不影响用户手动选码、定制和加购。

一期不建议引入 AI 或黑盒模型。在没有历史订单、退换货、试穿反馈及版师标注数据前，版本化尺码表和确定性规则更容易验收、解释和回滚。

## 2. 现状检查

### 2.1 Admin/API

- `src/services/size-recommendation-service.ts` 使用 `crypto.getRandomValues()` 随机选择尺码。
- `src/schemas/storefront.ts` 只校验 `productId`、`availableSizes` 和非空 `measurements`，没有将量体字段与当前已发布模板匹配。
- 接口只检查商品是否具有已发布定制配置，没有尺码表、规则版本和商品尺码映射。
- 已有 `verifyShopifyVariant` 可验证 Variant 归属和可售状态，但该能力属于加购/库存适配边界，不应参与身体尺码算法。
- 模板已定义 `measurementBlocks`、字段标准单位、最小值、最大值和步长，可用于服务端的输入合法性校验。

### 2.2 Shopify Theme

`assets/mtm-configurator.js` 已经实现：

- 仅在成功读取已保存量体资料时请求推荐；
- 收集当前颜色下的可售尺码（这是当前 Mock 的局限，正式算法不应依赖颜色或库存）；
- 将推荐尺码同步到原生 Variant Picker 和定制器；
- 在推荐尺码旁显示“推荐尺码”；
- 允许用户改选，并在推荐失败时继续正常定制。

正式实现可保留推荐展示和用户改选交互，但需要将“身体尺码推荐”与“颜色/Variant 库存适配”拆开。正式算法只依赖量体数据和类目规则，颜色切换不触发尺码重算。

### 2.3 业务资料缺口

当前需求文档确认了尺寸块、字段、单位、输入范围和 IN/CM 转换，但没有提供：

- 西服、西裤、马甲的正式尺码表；
- 不同版型或商品是否共用尺码表；
- 胸围、腰围、臀围、身高、体重等字段的推荐优先级；
- 区间临界、偏松/偏紧、特殊体型的处理原则；
- 用于回测的已确认量体样本和正确尺码。

以上数据需要业务方和版师确认，不应由开发人员在代码中自行假设。

## 3. 总体设计

```text
Admin 维护尺码表草稿
        ↓ 校验并发布不可变版本
商品绑定尺码表版本
        ↓
Theme 提交量体数据
        ↓
Storefront API 校验模板、单位和字段
        ↓
确定性评分引擎计算推荐尺码
        ↓
Theme 根据当前颜色定位该尺码的 Shopify Variant
        ↓
存在且可售：选中并显示推荐
缺失或缺货：保留推荐尺码并显示库存提示
```

## 4. 数据模型

### 4.1 量体属性元数据

现有 `measurementBlocks.fields` 同时承担“量体属性定义”和“模板表单配置”两种职责，不利于跨类目复用、单位标准化和推荐规则绑定。建议新增店铺级 `measurement_attributes` 作为稳定字典：

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `shop_id` | Shopify 店铺隔离键 |
| `code` | 店铺内唯一稳定编码，如 `height`、`waist`、`foot_length` |
| `name` | 默认显示名称 |
| `description` | 默认说明 |
| `value_type` | `number` 或 `enum` |
| `dimension` | `length`、`weight`、`size_code` 或 `none` |
| `canonical_unit` | `MM`、`CM`、`IN`、`KG`、`LB`、`CHI` 或 `NONE` |
| `precision` | 标准值保留小数位数 |
| `aliases_json` | 导入或历史数据别名，不用于算法主键 |
| `enabled` | 是否允许新配置引用 |
| `created_at` / `updated_at` | UTC 时间 |

对 `(shop_id, code)` 建立唯一约束。已被模板、量体档案或已发布推荐方案引用的属性不允许物理删除，只能停用。`code`、`value_type`、`dimension` 和 `canonical_unit` 发生破坏性变更时，应新建属性或通过显式数据迁移处理。

推荐引擎只依赖 `attributeId`/稳定 `code` 和标准化后的值，不依赖中文名称。

### 4.2 模板中的量体属性用法

同一个属性在不同类目中可以有不同的显示名称、必填性和合理范围。因此，这些信息仍属于模板中的使用配置，而不是全局元数据：

```ts
type MeasurementAttributeUsage = {
  attributeId: string;
  required: boolean;
  enabled: boolean;
  sortOrder: number;
  inputUnit: MeasurementUnit;
  displayUnit: MeasurementUnit;
  min?: number;
  max?: number;
  step?: number;
  labelOverride?: string;
  descriptionOverride?: string;
  imageUrl?: string;
};
```

演进后的 `measurementBlocks.fields` 保留表单和校验职责，但通过 `attributeId` 引用元数据，不再为每个模板重复创建一个实际上相同的“腰围”定义。

### 4.3 单位定义与标准化

单位维度和换算公式由系统代码内置并版本化，后台只能从兼容单位中选择，不允许运营人员录入任意换算倍率。

```text
输入值 + 输入单位
→ 检查单位与属性维度
→ 转换为 canonicalUnit
→ 按 precision 存储标准值
→ 推荐引擎使用标准值
```

尺码编码（如 `32`、`185/100C`、`A2`）不是物理单位，应作为 `size_code` 或推荐规则输出处理。

### 4.4 客户量体值

当前 `Record<string, number>` 可在兼容期继续使用，但正式模型应同时保存属性身份、原始输入和标准值：

```ts
type MeasurementValue = {
  attributeId: string;
  attributeCode: string;
  canonicalValue: number | string;
  canonicalUnit: MeasurementUnit;
  inputValue: number | string;
  inputUnit: MeasurementUnit;
  capturedAt?: string;
};
```

实施时应确定是在现有 `measurements_json` 中升级 Schema，还是新增结构化子表。一期可优先使用带 `schemaVersion` 的 JSON 以控制迁移范围，但读取时必须兼容现有平铺对象。

### 4.5 类目推荐方案

每个类目可绑定独立推荐方案，并选择不同算法：

```ts
type RecommendationPolicy = {
  id: string;
  shopId: string;
  category: string;
  name: string;
  algorithmType: "decision_table" | "direct_mapping" | "weighted_distance";
  inputAttributes: Array<{
    attributeId: string;
    required: boolean;
    weight?: number;
    missingValueStrategy: "reject" | "ignore";
    outOfRangeStrategy: "reject" | "penalize" | "clamp";
  }>;
  fallbackStrategy: "none" | "nearest";
  status: "draft" | "published" | "archived";
};
```

算法参数属于推荐方案，不写入量体属性元数据。例如 `waist` 在西服中可以是高权重必需字段，在皮带中是唯一映射输入，在皮鞋类目中则不使用。

### 4.6 尺码表

建议新增 `size_charts`：

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `shop_id` | Shopify 店铺隔离键 |
| `code` | 店铺内唯一编码 |
| `name` | 尺码表名称 |
| `category` | 适用品类 |
| `status` | `draft` / `published` / `archived` |
| `created_at` / `updated_at` | UTC 时间 |

### 4.7 尺码表版本

建议新增 `size_chart_versions`：

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `size_chart_id` | 所属尺码表 |
| `version` | 递增版本号 |
| `schema_version` | 规则 JSON Schema 版本 |
| `rules_json` | 不可变尺码和量体规则 |
| `published_at` | 发布时间 |

应对 `(size_chart_id, version)` 建立唯一约束。已发布版本不允许原地修改，后续调整必须生成新版本。

### 4.8 商品绑定

在 `product_bindings` 增加可空的 `size_chart_version_id`。不建议只按品类全局指定尺码表，因为不同版型、面料或商品可能存在不同放量。

旧绑定迁移后保持 `NULL`；尚未绑定尺码表的商品返回“暂无尺码推荐”，不影响手动选码。

### 4.9 规则样例

```json
{
  "algorithm": "weighted-distance-v1",
  "requiredMeasurements": ["height", "chest", "waist"],
  "sizes": [
    {
      "size": "48",
      "sortOrder": 0,
      "measurements": {
        "height": { "min": 168, "target": 173, "max": 178, "weight": 0.5 },
        "chest": { "min": 94, "target": 97, "max": 100, "weight": 1.5 },
        "waist": { "min": 80, "target": 84, "max": 88, "weight": 1.2 }
      }
    }
  ]
}
```

`size` 必须与 Shopify 商品的尺码 Option 值一致，或另外增加显式映射字段。禁止通过字符串顺序猜测 `S/M/L`、`46/48/50` 之间的尺码关系。

## 5. 推荐算法

### 5.1 可插拔算法架构

底层使用统一上下文和输出，通过算法注册表按类目方案调用，禁止在主服务中通过 `if (category === "suit")` 写死品类逻辑。

```ts
interface RecommendationAlgorithm<TConfig> {
  validateConfig(config: TConfig): ValidationResult;
  recommend(context: RecommendationContext, config: TConfig): RecommendationResult;
}

const algorithms = {
  decision_table: decisionTableAlgorithm,
  direct_mapping: directMappingAlgorithm,
  weighted_distance: weightedDistanceAlgorithm,
};
```

一期实现优先级：

1. `decision_table`：多字段区间全部命中后输出尺码，适用西服、衬衫和外套。
2. `direct_mapping`：单字段或枚举直接映射，适用皮带和裤码换算。
3. `weighted_distance`：无精确区间命中或后续需要连续评分时使用；可作为一期扩展项，但接口和 Schema 先预留。

每个类目独立配置 `algorithmType`、必需输入属性、匹配策略、重叠规则处理、无匹配策略和缺货策略。

### 5.2 标准化

- 服务端从已发布模板读取字段定义和标准单位。
- IN 输入统一转换为 CM；体重按字段的 `KG` 标准单位处理。
- 转换和四舍五入策略必须集中在服务端实现，不依赖 Theme 的显示精度。

### 5.3 决策表与直接映射

`decision_table` 的每条规则包含多个条件、优先级和一个输出：

```ts
type RecommendationRule = {
  id: string;
  priority: number;
  enabled: boolean;
  conditions: Array<{
    attributeId: string;
    operator: "between" | "gte" | "lte" | "eq" | "in";
    min?: number;
    max?: number;
    value?: string | number;
    values?: Array<string | number>;
  }>;
  result: {
    size: string;
    variantOptionValue?: string;
  };
};
```

引擎按优先级评估启用规则；默认要求同一条规则的所有条件成立。如果多条规则同时命中，根据方案的 `overlapStrategy` 按优先级、最精确区间或拒绝推荐处理。

`direct_mapping` 复用相同的条件和输出结构，但发布校验限制其只使用一个输入属性，便于后台以简化表格编辑。

### 5.4 加权距离

对每个候选尺码和每个有效量体字段计算：

```text
容差 = max(target - min, max - target)
字段距离 = abs(actual - target) / 容差
字段得分 = 字段距离 × weight
尺码总分 = 字段得分之和 / 有效权重之和
```

总分越低越匹配。对超出 `min/max` 的字段增加固定惩罚，避免某个关键围度明显不合适却被其他字段平均掉。具体惩罚值应在算法版本中固定，不应由请求参数控制。

### 5.5 选择规则

1. 根据完整尺码表计算身体尺码，不使用颜色、Variant 或当前库存缩小算法候选集。
2. 缺失非必需字段时，仅使用已提供字段并重新归一化权重。
3. 缺失必需字段时，返回数据不足，不进行猜测。
4. 最低得分相同时，使用尺码表的 `sortOrder` 保证结果稳定。
5. 得分超过已确认阈值时，返回无可靠推荐，而不是强制返回“最不差”的尺码。

身高和体重可作为辅助字段，但西服、西裤等品类不应仅依赖 BMI 或身高体重区间决定尺码。胸围、腰围、臀围等关键围度的权重需由版师确认。

### 5.6 置信度

可根据得分、完整字段比例以及第一/第二候选的得分差返回 `high`、`medium` 或 `low`。置信度阈值应由回测样本确定，不应在没有样本的情况下随意设定。

## 6. Storefront API

### 6.1 请求

保留现有路径：

```text
POST /api/storefront/size-recommendation
```

建议将请求调整为：

```json
{
  "productId": "10296845205799",
  "unit": "CM",
  "measurements": {
    "height": 175,
    "chest": 98,
    "waist": 84
  }
}
```

Theme 不再提交颜色、候选尺码或 Variant ID。推荐服务只负责返回基于量体数据和类目规则的尺码。当前颜色下是否存在对应 Variant、是否可售，由 Theme 在获得推荐尺码后使用页面已有 Variant 数据判断。

### 6.2 成功响应

在保留现有主要字段的基础上增加算法和规则版本：

```json
{
  "mock": false,
  "recommendationVersion": 3,
  "sizeChartVersion": 7,
  "algorithm": "weighted-distance-v1",
  "recommendedSize": "48",
  "confidence": "high",
  "basedOnMeasurements": ["height", "chest", "waist"],
  "missingMeasurements": [],
  "score": 0.18
}
```

对外响应不应返回完整尺码表、内部权重或其他商业规则。

### 6.3 无法推荐

对“请求合法，但资料不足或没有可靠匹配”的情况，建议返回 HTTP 200：

```json
{
  "mock": false,
  "recommendationVersion": 3,
  "recommendedSize": null,
  "confidence": "none",
  "reason": "missing_required_measurements",
  "missingMeasurements": ["chest"]
}
```

Theme 将其视为可预期业务结果，不需要在浏览器控制台输出异常。

### 6.4 错误语义

| HTTP | 场景 |
|---|---|
| `400` | JSON 无效 |
| `401` | App Proxy 鉴权失败 |
| `404` | 商品没有已发布配置 |
| `409` | 已发布推荐方案与量体属性配置冲突 |
| `422` | 未知量体字段、越界数值或单位无效 |

商品尚未绑定尺码表可返回 HTTP 200 的 `reason: "size_chart_unavailable"`，以允许分批配置和上线。

## 7. Admin 管理能力

### 7.1 量体属性管理页面

Admin 增加独立的“量体属性”导航和页面，不将元数据维护继续藏在单个模板编辑器内。

列表页展示：

- 属性名称和稳定编码；
- 值类型、物理维度和标准单位；
- 精度、别名和启停状态；
- 被多少模板和推荐方案引用；
- 最后更新时间。

支持按名称/编码搜索，按维度和状态筛选，以及新增、编辑、启用和停用。对已被引用属性，页面应阻止删除或破坏性修改，并显示引用位置。

编辑表单包含：

- 名称、编码和说明；
- 数值/枚举类型；
- 长度、重量、尺码编码或无维度；
- 与维度兼容的标准单位；
- 数值精度；
- 用于导入和旧字段识别的别名；
- 启用状态。

首期可提供身高、体重、胸围、腰围、臀围、肩宽、袖长、裤内长、领围、脚长和脚宽等种子属性；种子数值只是字典初始化，不包含客户尺码表中的具体区间。

### 7.2 量体属性 Admin API

建议新增：

```text
GET  /api/measurement-attributes
POST /api/measurement-attributes
GET  /api/measurement-attributes/:id
PUT  /api/measurement-attributes/:id
DELETE /api/measurement-attributes/:id
```

`DELETE` 仅允许删除从未被引用的草稿属性；否则返回 HTTP 409，并引导使用停用。所有接口使用 Shopify Session Token 鉴权并按 `shop_id` 过滤。

### 7.3 模板编辑器联动

模板的“尺寸块与字段”界面需要调整：

- 新增字段时从已启用量体属性中选择；
- 自动带出属性编码、默认名称、维度和兼容单位；
- 模板仅编辑显示名称覆盖、说明、图片、必填、范围、步长和排序；
- 禁止在模板内修改属性的物理维度和标准单位；
- 为尚未迁移的历史字段显示“未关联元数据”状态，并允许管理员手动关联。

### 7.4 推荐方案和尺码表页面

需要新增类目推荐方案与尺码表管理界面，包含：

- 尺码表新增、复制、编辑、归档和发布；
- 每个类目独立选择 `decision_table`、`direct_mapping` 或 `weighted_distance`；
- 从量体属性字典选择算法输入，配置必需性、缺失值和越界策略；
- 品类、版型说明和标准单位；
- 每个尺码的显示值和稳定排序；
- 每个量体字段的最小值、目标值、最大值和权重；
- 必需字段设置；
- 商品绑定尺码表的已发布版本；
- 输入一组量体数据执行试算预览。

发布前至少校验：

- 尺码编码不重复；
- `min <= target <= max`；
- 权重为有限正数；
- 必需字段存在于相应品类模板中；
- 单位与模板字段标准单位一致；
- 每个尺码都具有最低限度的可用规则；
- 尺码表输出编码可以映射到所绑定商品的 Shopify 尺码 Option；映射仅用于绑定校验和前端 Variant 定位，不参与量体算法。

## 8. Theme 改造

Theme 主要交互保持不变，需补充：

1. 明确提交当前量体资料的输入单位，不提交颜色、可售尺码或 Variant ID。
2. 将 `recommendedSize: null` 视为可预期结果，可按 `reason` 显示友好提示。
3. 尺码推荐成功后，根据当前颜色从页面已有 Variant 数据中定位同尺码 Variant。
4. 颜色切换时保留原推荐尺码，只重新执行 Variant 定位和库存状态展示，不重新调用推荐算法。
5. 当前颜色下没有该尺码或已缺货时，显示“推荐尺码当前颜色不可售”，不擅自将推荐结果替换为相邻尺码。
6. 仅在用户尚未主动选码时自动选中推荐结果；已有主动选择时只显示标记。
7. 推荐失败或推荐尺码在当前颜色下不可售，均不阻断定制、手动选码或加购其他可售尺码。

## 9. 服务分层建议

```text
app/admin 量体属性管理页面
        ↓
app/api/measurement-attributes/**
        ↓
src/services/measurement-attribute-service.ts
        ↓
src/repositories/measurement-attribute-repository.ts

app/api/storefront/size-recommendation/route.ts
        ↓ HTTP 解析、鉴权和响应
src/schemas/size-recommendation.ts
        ↓ 外部输入与规则 JSON 校验
src/services/size-recommendation-service.ts
        ↓ 编排模板、尺码表与算法
src/domain/size-recommendation.ts
        ↓ 纯函数评分、置信度和结果类型
src/repositories/size-chart-repository.ts
        ↓
D1
```

评分引擎应保持为无 I/O 纯函数，便于对临界值和回测样本进行完整单元测试。

## 10. 隐私、安全与可观测性

- 不在日志中输出完整量体数据。
- 可记录规则版本、算法版本、结果尺码、置信度、缺失字段数和耗时，但不记录各部位具体数值。
- Storefront 响应不返回完整尺码规则或内部权重。
- 尺码表 Admin 写接口必须使用现有 Shopify Session Token 鉴权，并按 `shop_id` 隔离。
- 尺码表发布应考虑并发修改和审计时间；正式环境后续应补充发布人信息。

## 11. 实施步骤

### 阶段一：量体属性元数据

1. 新增 `MeasurementAttribute` Domain 类型和 Zod Schema。
2. 新增 `measurement_attributes` Drizzle Schema、D1 迁移、索引和幂等 `ensureDb` 兼容逻辑。
3. 新增 Repository、Service 和鉴权 Admin API。
4. 增加默认量体属性种子数据，但不写入客户提供的具体尺码区间。
5. Admin 增加“量体属性”导航、列表、搜索筛选、新建/编辑表单、启停和引用保护。
6. 为属性编码、维度、标准单位及别名建立服务端校验。

### 阶段二：模板关联与兼容迁移

1. `MeasurementFieldDefinition` 增加 `attributeId`，发布新模板时要求引用有效属性。
2. 模板尺寸字段编辑改为从属性字典选择，只保留模板级展示和校验覆盖。
3. 按稳定 `code` 为现有种子模板和历史模板尝试自动关联；不能唯一匹配的记为待人工确认。
4. 读取层继续支持未带 `attributeId` 的已发布模板，避免影响现有 Storefront。
5. 设计并实现量体档案从平铺 `Record<string, number>` 到带标准值结构的兼容读写。

### 阶段三：业务规则确认

1. 收集西服、西裤、马甲的正式尺码表。
2. 确认每个类目使用的量体属性、算法类型、必需性和兜底策略。
3. 确认商品、版型与尺码表的复用关系。
4. 提供版师已确认的回测样本。

### 阶段四：推荐方案与尺码表基础能力

1. 新增 Domain 类型和 Zod Schema。
2. 新增 Drizzle Schema 和幂等 D1 迁移。
3. 实现 Repository 和 Admin API。
4. 实现草稿校验、版本发布和商品绑定。
5. 实现 Admin 管理界面和试算预览。

### 阶段五：推荐引擎

1. 实现单位标准化。
2. 实现算法注册表和统一输入输出。
3. 实现 `decision-table-v1` 和 `direct-mapping-v1` 纯函数。
4. 实现必需字段、规则优先级、重叠检测、无匹配和稳定排序。
5. 按项目范围实现或预留 `weighted-distance-v1`。
6. 用回测样本校准阈值。

### 阶段六：替换 Mock 与 Theme 对接

1. 将 `recommendMockSize` 替换为正式服务，保留 API 路径。
2. 接入已发布尺码表版本。
3. 验证量体字段和尺码表配置，推荐服务不读取颜色或库存。
4. 调整 Theme 请求、推荐尺码与 Variant 的二阶段处理及业务提示。
5. 更新 README、CF API 参考和相关任务文档。

### 阶段七：灰度与回测

1. 先为单个品类和少量商品绑定尺码表。
2. 对比系统结果和版师标注。
3. 检查无法推荐比例、低置信度比例和用户改选比例。
4. 确认阈值后再扩大商品范围。

## 12. 测试与验证

### 12.1 单元测试

- 量体属性编码在店铺内唯一；
- 物理维度与标准单位兼容性；
- 已被引用属性不允许删除或破坏性修改；
- 已停用属性仍可正常读取历史数据，但不能用于新配置；
- 决策表单规则、多规则优先级、重叠规则和无匹配策略；
- 直接映射的区间和枚举输入；
- 同一输入重复计算结果一致；
- CM 和等价 IN 输入得到相同结果；
- 最小值、目标值、最大值和区间外临界点；
- 缺少必需字段；
- 缺少非必需字段；
- 候选得分相同时结果稳定；
- 所有尺码均超出可信阈值；
- 库存和颜色变化不改变算法输出的推荐尺码。

### 12.2 API 测试

- 量体属性列表按店铺隔离；
- 新增、编辑、启停、删除未引用属性；
- 重复编码、非法单位、无效精度和已引用删除冲突；
- 旧模板和旧量体档案的兼容读取；
- 正常推荐；
- 商品未绑定尺码表；
- 商品没有已发布定制配置；
- 未知量体字段、越界数值和无效单位；
- D1 读取失败。

### 12.3 Theme 人工验证

- 有历史量体资料时正确显示推荐；
- 无历史量体资料时不发起推荐；
- 颜色切换后推荐尺码保持不变，只更新对应 Variant 和库存提示；
- 当前颜色下推荐尺码不存在或缺货时，不自动切换到相邻尺码；
- 用户主动改选后不被后续同步强制覆盖；
- 推荐失败、资料不足或尺码表未配置时仍可手动选码和加购；
- 原生 Variant Picker、定制器和最终加购 Variant 保持一致；
- 桌面端和移动端推荐提示正确布局。

### 12.4 项目验证命令

Admin/API：

```bash
npx tsc --noEmit
npm run lint
npm test
```

Theme：

```bash
shopify theme check
```

此外需在真实 Shopify 测试店铺中验证 Variant 可售性、颜色联动、加购和移动端交互。

## 13. 上线与回滚

- 数据库迁移只新增表和可空外键，不覆盖旧数据。
- 在商品未绑定尺码表时保持手动选码，便于分批上线。
- 建议保留店铺级或商品级的推荐开关，异常时可关闭推荐而不影响定制和交易。
- 回滚应优先停用推荐或将商品切回上一个尺码表版本，不删除已发布版本和历史记录。

## 14. 待业务确认

开始正式算法实施前，需确认：

1. 西服、西裤、马甲首期分别使用哪些量体字段。
2. 正式尺码表和 Shopify Variant 尺码值的映射。
3. 尺码表是按品类、版型还是单个商品管理。
4. 偏松、标准、偏紧穿着偏好是否纳入一期。
5. 尺码临界时的默认倾向，以及是否需要返回两个候选尺码。
6. 低置信度时是显示弱提示，还是完全不展示推荐。
7. 用于验收和阈值校准的量体样本与版师标注结果。

## 15. 范围结论

本功能不是单纯替换一个随机函数。正式实现至少包含量体属性元数据管理、模板字段关联、类目独立算法方案、尺码表数据模型、版本发布、商品绑定、服务端校验、通用推荐引擎、Theme 尺码与 Variant 适配以及回测验收。

建议先以一个品类、一张已确认尺码表和一组版师标注样本完成端到端落地，验证结果后再扩展到其他品类和商品。
