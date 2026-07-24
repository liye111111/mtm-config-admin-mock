# 一期服装定制 Domain 模型改造任务

## 1. 文档状态

- 状态：待实施
- 任务类型：跨 Domain、API、D1、管理端和 Storefront 的兼容性改造
- 需求基线：`Shopify服装定制项目最新需求说明.md` 一期确认稿
- 核心业务约束：一期所有定制项均不影响价格，成交价完全使用 Shopify Product/Variant 价格

本文只定义改造任务、边界、步骤和验收方式，不在本任务文档阶段修改业务实现。

## 2. 背景与问题

当前 Domain 仅提供简单的模板、步骤和选项结构：

```text
TemplateConfig
├── steps
│   └── Choice(value, label)
├── pieces
└── pieceSelection
```

该模型可以支持 POC，但无法完整表达一期需求中的：

- 西服、西裤和马甲等适用品类；
- 选项图片、说明、排序、启停、默认值和展示样式；
- 选项显示、隐藏、禁用、互斥和自动选择关系；
- 可配置尺寸块、尺寸字段及 IN/CM 输入；
- 一个客户保存多套量体档案；
- 用户本次定制实例及订单配置快照；
- 商品定制能力的启用、停用与无配置状态；
- 已发布模板的版本兼容与历史订单还原。

当前 `TemplateConfig` 和 `CompositePiece` 还存在开放的 `[key: string]: unknown`，核心配置缺少严格类型；数据库读取后直接 `JSON.parse` 并断言为 `TemplateConfig`，无法识别无效数据或旧版本数据。

## 3. 改造目标

1. 建立可表达一期完整业务语义的 Domain 模型。
2. 将“运营定义的模板”与“消费者实际选择的配置实例”分离。
3. 将“尺寸字段定义”与“客户量体档案/订单尺寸快照”分离。
4. 使用稳定英文编码进行系统关联，中文名称只用于展示和快照。
5. 保持 Shopify Product、Variant、Cart Line 和 Line Item Properties 的既有边界。
6. 一期模型中不实现定制加价、价格计算和 Checkout 价格覆盖。
7. 为现有模板数据提供可重复、可回滚的兼容迁移方案。
8. 保持现有 Storefront API 和 Shopify Theme POC 在迁移期可继续工作。

## 4. 不在本任务范围

- 定制加价、减价和动态价格计算；
- Shopify Checkout 价格覆盖；
- ERP、MTM、CRM 或门店预约系统集成；
- 正式的 Shopify Embedded Admin App 鉴权实现；
- 新版 Customer Account Extension 页面开发；
- 视觉稿和 AISTUDIO 交互样式还原；
- 对生产 D1 直接执行破坏性迁移。
- Shopify Fixed Bundle、动态 Mix-and-match Bundle、消费者任意增删套装组件及 Cart Transform Function。

上述功能如果后续确认，应另建任务文档。

## 5. 领域边界与聚合

### 5.1 Template 聚合

表示运营人员发布的可定制能力定义，包含：

- 模板基础信息；
- 适用品类；
- 单品模板或普通套装商品的固定逻辑组件模板结构；
- 定制步骤；
- 步骤选项；
- 选项关系；
- 尺寸块和尺寸字段定义；
- 模板状态与版本。

### 5.2 Product Binding 聚合

表示 Shopify 商品与已发布模板的绑定，包含：

- Shopify Product ID；
- 商品标题与 Handle；
- 模板 ID 和指定发布版本；
- 是否启用。

本聚合不管理成衣购买模式。成衣购买始终属于 Shopify 原生商品能力；定制服务只管理商品是否存在可用的定制配置。

### 5.3 Measurement Profile 聚合

表示 Shopify Customer 保存的一套量体档案，包含：

- Shopify Customer ID；
- 档案名称和量体对象名称；
- 标准化后的尺寸值；
- 用户输入单位；
- 创建和更新时间。

一个 Customer 可以拥有多套 Profile。修改 Profile 不得影响历史订单快照。

### 5.4 Customization Instance 聚合

表示消费者针对某个 Shopify Variant 的一次实际定制过程，包含：

- Product/Variant；
- 模板 ID、编码和版本；
- 普通套装商品内由模板预定义的固定逻辑组件；
- 每个逻辑组件的定制选择；
- 使用的量体档案及尺寸快照；
- 编辑、已校验、已加购或已下单状态。

### 5.5 Order Customization Snapshot

表示下单时固化的定制结果。它不能只引用可修改的模板和量体档案，必须保存：

- 模板版本；
- 套装逻辑组件编码、名称及各组件配置；
- 选项编码及下单时展示名称；
- 尺寸标准值及单位；
- Shopify Order/Line Item 关联标识；
- 配置实例 ID。

## 6. 计划中的 Domain 文件结构

领域关系图：

- 核心概览：`doc/domain-model-overview.puml`；
- 完整设计：`doc/domain-model.puml`。

```text
src/domain/
├── common.ts
├── template.ts
├── option.ts
├── relation.ts
├── measurement.ts
├── customization-instance.ts
├── order-snapshot.ts
├── product-binding.ts
├── persistence.ts
└── index.ts
```

职责约定：

- Domain 文件只表达业务类型和纯业务约束，不直接访问 D1、HTTP 或 Shopify API。
- D1 行类型放在 `persistence.ts`，避免数据库 snake_case 字段污染业务模型。
- API 输入输出由 `src/schemas/` 和明确的 View/DTO 负责。
- Domain 不依赖 React、Route、Repository 或 Worker 环境对象。

## 7. 计划新增或调整的核心类型

### 7.1 公共类型

```ts
type GarmentCategory = "suit" | "jacket" | "trousers" | "waistcoat";
type TemplateStatus = "draft" | "published";
type TemplateType = "single" | "composite";
type MeasurementUnit = "CM" | "IN";
```

数据库和 API 使用稳定英文编码；管理端通过独立 Label 显示中文。

### 7.2 套装逻辑组件

一期套装使用一个普通 Shopify Product/Variant 作为销售单元，套装内部的上衣、西裤和马甲仅作为定制、生产及 ERP/MTM 拆单语义中的固定逻辑组件。消费者不能增删组件。原计划的 `CustomizablePiece` 调整为：

```ts
type GarmentComponentDefinition = {
  id: string;
  code: string;
  name: string;
  category: GarmentCategory;
  childTemplateId: string;
  customizationEnabled: boolean;
  sortOrder: number;
};
```

- Shopify 只维护整个套装商品的 Product/Variant、基础售价和套装销售库存，不识别内部逻辑组件。
- `GarmentComponentDefinition` 只负责上衣、西裤、马甲等逻辑组件与子定制模板的映射。
- 两件套、三件套等不同组成分别对应不同的普通 Shopify 套装商品及组合模板。
- 套装以一个普通套装 Variant 加入购物车并形成一个订单行；定制流程按固定逻辑组件依次展开，不存在 `piece_selection` 步骤。
- 完整组件配置保存在 D1，订单快照供 ERP/MTM 按逻辑组件拆分生产任务。

### 7.3 定制步骤和选项

`Choice` 将被替换为明确的 `CustomizationOption`：

```ts
type CustomizationOption = {
  id: string;
  code: string;
  name: string;
  description?: string;
  imageUrl?: string;
  sortOrder: number;
  enabled: boolean;
  defaultSelected: boolean;
  applicableCategories: GarmentCategory[];
  affectsPrice: false;
};
```

`ConfigStep` 将替换为 `CustomizationStep`，增加：

- 严格的步骤类型；
- 展示样式；
- 排序；
- 启停；
- 必填性；
- 完整选项集合。

一期允许的展示样式：

```text
image_card
color_swatch
radio
select
text_input
```

### 7.4 选项关系

新增 `OptionRelation`，一期允许：

```text
show
hide
enable
disable
exclude
auto_select
```

关系通过 `sourceStepCode/sourceOptionCode` 指向触发项，通过 `targetStepCode/targetOptionCode` 指向目标，不允许使用显示名称建立关系。

### 7.5 尺寸定义和尺寸值

新增：

- `MeasurementBlock`；
- `MeasurementFieldDefinition`；
- `MeasurementValue`；
- `MeasurementProfile`。

存储规则：

- 后端标准值统一保存为 CM；
- 同时记录用户输入值和输入单位，用于回显与审计；
- IN/CM 转换采用统一精度规则；
- 字段定义包含最小值、最大值、步长、图片、说明、排序和启停状态。

### 7.6 定制实例和订单快照

新增：

- `SelectedOption`；
- `GarmentComponentConfiguration`；
- `CustomizationInstance`；
- `OrderCustomizationSnapshot`。

Line Item Properties 只保存消费者可读摘要、稳定编码、配置实例 ID、模板编码和模板版本；完整 JSON 保存于 D1 配置实例/订单快照。

## 8. Zod 与 Domain 的关系

- `src/domain/` 定义内部业务模型。
- `src/schemas/` 定义外部输入和数据库 JSON 的运行时 Schema。
- API DTO 类型优先通过 `z.infer` 从 Schema 生成。
- Schema 解析成功后再进入 Service，Route 和 Service 不使用类型断言绕过校验。
- 从 D1 读取的 `config_json`、`selections_json` 和 `measurements_json` 必须经过对应 Zod Schema 解析。
- 旧版模板 JSON 使用独立的 Legacy Schema 识别，不把任意对象直接断言为新版模板。

## 9. D1 数据结构计划

### 9.1 保留并调整现有表

#### `templates`

- 保留模板基本字段和 `config_json` 聚合存储方式；
- 增加明确的 `schema_version`；
- 新发布配置统一写入新版 JSON；
- 读取时根据 `schema_version` 选择新版解析或旧版兼容转换。

#### `template_versions`

- 增加 `schema_version`；
- 继续保存不可变的发布配置快照；
- 保证 `(template_id, version)` 唯一。

#### `product_bindings`

计划增加：

- `enabled`；
- 可选的并发更新版本或更新时间校验。

不增加 `purchase_modes_json`。商品是否支持成衣购买不由定制服务控制。

### 9.2 计划新增表

#### `measurement_profiles`

```text
id
shopify_customer_id
name
subject_name
values_json
created_at
updated_at
```

索引：

- `shopify_customer_id`；
- 必要时增加 `(shopify_customer_id, name)` 约束或业务校验。

#### `customization_instances`

```text
id
shopify_product_id
shopify_variant_id
shopify_customer_id
template_id
template_code
template_version
status
component_configurations_json
measurement_profile_id
measurement_snapshot_json
created_at
updated_at
```

索引：

- `shopify_customer_id`；
- `shopify_product_id`；
- `status`；
- 必要时增加过期草稿清理索引。

#### `order_customization_snapshots`

```text
id
config_id
shopify_order_id
shopify_line_item_id
snapshot_json
created_at
```

唯一性需要结合订单同步方式确认，至少保证同一 Shopify Line Item 不重复创建快照。

## 10. 数据迁移方案

### 10.1 原则

- 只增加字段和新表，不在第一阶段删除旧字段。
- 迁移必须可重复执行。
- 先兼容读取，再迁移数据，最后切换写入。
- 不在正常请求中长期执行复杂批量迁移。
- 生产执行前导出 D1 备份并记录恢复命令。

### 10.2 迁移阶段

1. 增加新版 Domain 和 Zod Schema，不改变现有 API。
2. 实现 Legacy Template Config 到新版模型的纯转换函数。
3. 增加 D1 字段、新表、索引和 Drizzle Schema。
4. Repository 支持读取旧版和新版配置。
5. 管理端保存草稿时写新版 Schema。
6. 发布模板时校验所有编码、关系和尺寸范围。
7. Storefront API 输出兼容现有主题的数据，并逐步增加新版字段。
8. 使用独立迁移命令批量转换存量模板；记录成功、跳过和失败数量。
9. 完成回归后再评估是否移除 Legacy 读取逻辑；一期上线前不强制删除。

### 10.3 回滚

- 代码回滚后仍能读取保留的旧字段和旧配置快照。
- 新增表不在紧急回滚时删除，避免丢失用户量体和配置数据。
- 新版模板转换前保留原始 JSON 备份或原始版本记录。
- 若新版发布失败，商品绑定继续指向上一个已发布版本。

## 11. API 及兼容性计划

### 11.1 现有API

以下路径在改造期间保持不变：

```text
GET  /api/templates
POST /api/templates
PUT  /api/templates/:id
POST /api/templates/:id/publish
GET  /api/templates/:id/versions
GET  /api/products
POST /api/products
PUT  /api/products/:id
GET  /api/storefront/config/:productId
POST /api/storefront/validate
```

兼容要求：

- 管理端现有模板在 Legacy 转换后仍可打开；
- Storefront API 不返回草稿、内部审计字段或客户隐私数据；
- Storefront API 统一使用 `enabled + configuration` 响应，不再通过404表示没有定制功能；
- `configuration` 内继续提供主题所需的 `templateId`、`version`、`steps`、`pieces` 和尺寸字段；
- 主题侧必须与响应结构变更同步发布，不能只发布服务端；
- 错误响应继续提供稳定 `error` 字段和可区分状态码。

### 11.2 Storefront配置响应

`GET /api/storefront/config/:productId` 使用判别联合结构：

```ts
type StorefrontConfigResponse =
  | {
      enabled: false;
      configuration: null;
    }
  | {
      enabled: true;
      configuration: StorefrontConfiguration;
    };
```

存在已启用绑定且模板已发布时返回：

```json
{
  "enabled": true,
  "configuration": {
    "templateId": "mens_suit_v1",
    "version": 4,
    "steps": []
  }
}
```

商品无绑定、绑定已停用或没有已发布模板时返回HTTP 200：

```json
{
  "enabled": false,
  "configuration": null
}
```

以下情况不能伪装为 `enabled: false`：

- D1查询失败；
- 已发布配置JSON损坏；
- 服务端程序异常。

这些情况仍返回对应4xx/5xx错误，便于监控和排障。商品定制能力的判断规则为：

```text
存在商品绑定
+ 绑定 enabled = true
+ 绑定模板 status = published
= enabled: true
```

### 11.3 计划新增API

具体路径在实现前复核并保持小写 kebab-case，预计包含：

```text
GET    /api/measurement-profiles
POST   /api/measurement-profiles
GET    /api/measurement-profiles/:id
PUT    /api/measurement-profiles/:id
DELETE /api/measurement-profiles/:id

POST   /api/storefront/configurations
PUT    /api/storefront/configurations/:id
POST   /api/storefront/configurations/:id/validate
```

新增用户数据接口前必须完成客户身份校验和所有权校验。POC 若暂不具备可靠身份认证，不得将量体档案接口部署为公开生产接口。

## 12. Shopify 数据映射

```text
Shopify Product
└── Shopify Variant（普通单品或普通套装的价格与销售SKU）
    └── Cart Line
        ├── 可读 Line Item Properties
        ├── 稳定编码 Properties
        ├── _配置ID
        ├── _配置模板
        └── _配置版本
```

一期约束：

- 所有定制项不改变 Shopify Variant 价格；
- 套装使用普通 Shopify Product/Variant，并以一个 Variant 加入购物车、形成一个 Cart Line；
- Shopify 不识别套装内部的上衣、西裤和马甲逻辑组件，也不分别维护其价格、库存和履约；
- 套装售价、销售 SKU 和可售库存均属于整个套装 Variant；组件拆分属于定制服务及 ERP/MTM 的生产语义；
- 定制服务保存每个预定义逻辑组件的定制属性和尺寸，订单快照保存下单时的不可变组件明细；
- 不支持消费者任意增删套装组件；两件套和三件套使用不同的普通 Shopify 商品及模板；
- 不开发Cart Transform Function；
- 不为领型、口袋、绣字和身体尺寸生成 Variant；
- 不将客户尺寸写入 Product、Variant 或商品 Metafield；
- 不把过大的完整配置 JSON 写入 Line Item Properties；
- 不同配置通过 Properties 和配置 ID 保持购物车行可区分。

该方案的明确代价是 Shopify 原生订单、库存、履约、退货和报表只识别整个套装商品，无法原生按上衣、西裤和马甲分别处理。若后续要求组件级库存、组件 SKU 或组件级履约，应另建任务重新评估 Shopify Fixed Bundle，而不是在本模型中隐式模拟 Bundle。

## 13. 涉及目录与关键文件

计划修改范围：

```text
src/domain/**
src/schemas/**
src/services/**
src/repositories/**
db/schema.ts
drizzle/**
app/api/**
app/config-admin.tsx
README.md
```

如果 Storefront 输出结构发生变化，还需检查用户指定或工作区实际定位到的 Shopify Theme 项目，不在任务文档中写死主题目录。

## 14. 实现步骤

1. 补充新版 Domain 类型及纯转换函数。
2. 建立对应 Zod Schema、旧版 Schema 和兼容转换测试。
3. 将模板序列化从直接 `JSON.parse + as` 改成 Schema 解析。
4. 更新模板发布校验：编码唯一、默认值合法、关系目标存在、尺寸范围合法。
5. 更新 Drizzle Schema、幂等迁移SQL和数据库行类型。
6. 更新 Repository，实现旧版/新版双读和新版写入。
7. 更新 Service，保持 Route 轻量且不写SQL。
8. 更新管理端编辑能力和JSON预览。
9. 更新 Storefront 配置输出和服务端合法性校验。
10. 增加量体档案和配置实例持久层；身份认证未完成前限制对外开放。
11. 更新 README、API说明和业务数据模型文档。
12. 在本地D1完成迁移和回归后，再制定生产迁移窗口。

## 15. 验证计划

### 15.1 自动验证

在项目根目录执行：

```bash
npm run lint
npm test
```

如果保留独立类型检查脚本或命令，同时执行：

```bash
npx tsc --noEmit
```

计划补充的自动测试：

- 旧模板JSON转换为新版模型；
- 新版模板Schema成功和失败用例；
- 重复选项编码；
- 无效关系目标；
- 套装逻辑组件与子模板映射无效；
- 配置实例缺少组合模板中预定义的可定制组件；
- 尺寸最小值大于最大值；
- IN/CM转换与精度；
- 配置版本不一致；
- 商品存在已启用绑定和已发布模板时返回 `enabled: true`；
- 商品无绑定、绑定停用或模板未发布时返回HTTP 200及 `enabled: false`；
- 不存在资源返回404；
- D1写入失败不产生部分发布结果。

### 15.2 API验证

- 模板列表、创建、保存、发布和版本查询成功路径；
- 非法输入返回400和稳定错误结构；
- Storefront商品无定制配置时返回200、`enabled: false`和`configuration: null`；
- Storefront服务异常与无配置状态可明确区分；
- 旧版模板仍可读取；
- Storefront只读取已发布配置；
- Storefront不暴露草稿或内部字段；
- 不影响价格的选项不会产生价格字段或价格修改请求。
- 普通套装只加入一个 Shopify Variant，并通过配置 ID 关联完整逻辑组件配置。

### 15.3 人工验证

1. 在管理端创建西服、西裤和马甲模板。
2. 配置图片、说明、排序、默认值、启停和展示样式。
3. 配置显示、隐藏、禁用、互斥和自动选择关系。
4. 创建上衣和西裤尺寸块并切换IN/CM。
5. 发布模板并绑定 Shopify 商品。
6. 在普通套装商品页按固定逻辑组件完成定制、Review 和加入购物车。
7. 确认购物车价格始终为 Shopify Variant 价格。
8. 确认购物车显示摘要且不同配置不错误合并。
9. 确认订单属性包含配置ID、模板和版本。
10. 确认修改量体档案不改变既有订单快照。
11. 确认套装在 Shopify 中只有一个订单行，ERP/MTM 可从 D1 订单快照拆分全部逻辑组件。

## 16. 风险与控制

### 16.1 配置JSON兼容风险

风险：直接替换 `TemplateConfig` 会导致已有模板无法解析。

控制：Legacy Schema、纯转换函数、Schema Version和双读机制。

### 16.2 D1迁移风险

风险：Drizzle定义、实际建表SQL和生产D1不一致。

控制：同步修改Schema和迁移；本地副本验证；生产前备份；迁移只增不删。

### 16.3 主题兼容风险

风险：Storefront输出字段变化导致定制按钮或步骤无法显示。

控制：保留现有关键字段；新增契约测试；在主题预览环境完整回归。

### 16.4 用户隐私风险

风险：量体数据属于个人数据，公开接口或日志可能泄露。

控制：可靠鉴权、资源所有权校验、日志脱敏、最小化响应；未完成鉴权前不对生产开放。

### 16.5 并发编辑风险

风险：两个运营人员同时保存导致后写覆盖先写。

控制：使用版本或 `updated_at` 实现乐观并发校验，并保留发布版本快照。

### 16.6 当前POC安全缺口

当前管理写接口鉴权、生产CORS限制、审计和幂等能力仍需核实。Domain改造不能被描述为已经解决这些生产安全问题。

## 17. 完成标准

满足以下条件后，本任务才可标记完成：

- 新版Domain可完整表达一期已确认需求；
- 核心模型不再依赖开放的`unknown`承载已知业务字段；
- 所有数据库JSON读取均经过Zod或Legacy Schema解析；
- Drizzle Schema、实际迁移SQL、行类型和Repository一致；
- 旧模板可兼容读取并有明确迁移结果；
- 管理端和Storefront API回归通过；
- Shopify商品价格不因定制选择改变；
- 量体档案与订单尺寸快照隔离；
- 普通套装以一个 Shopify Variant 和一个订单行成交，订单快照可完整还原并拆分逻辑组件；
- `npm run lint`和`npm test`通过；
- 相关README、API说明和业务数据模型文档同步更新；
- 交付说明列出已执行验证、未验证项、上线步骤和回滚方式。
