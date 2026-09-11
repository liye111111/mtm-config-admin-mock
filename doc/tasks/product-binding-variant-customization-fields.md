# 商品绑定阶段动态维护全部 Variant Metafields

## 目标

运营人员在 Shopify 完成商品 Option、Variant 和 SKU 基础结构，在绑定定制模板时统一维护该商品全部 ProductVariant metafields。绑定页不得写死字段名称、namespace、key 或类型；新增、修改或删除 Shopify metafield definition 后，重新读取即可同步表单。

后续面料库会保存可复用的面料主数据，绑定时选择面料并自动带入字段；本阶段不建立面料库，也不把 metafield 值复制到 D1，为后续引用和覆盖机制保留空间。

## 数据归属

Shopify ProductVariant metafield definition 决定字段名称、namespace/key、类型、说明和校验规则；各 Variant metafield 保存实际值。商品绑定记录保存模板、版本、`variantOptionMappings`，以及前台可见字段白名单 `visibleVariantMetafields`；不复制 Variant 元数据值。旧字段 `custom.material_composite_base` 已删除。

本阶段读取店铺全部 `PRODUCTVARIANT` 定义，包括非 `custom` namespace。无定义的游离 metafield 不进入表单，避免无法获得可靠名称、类型和校验规则。

## 管理流程与 API

绑定页每次只选择和绑定一个商品，选择后即可读取字段；材质 Option 映射仅影响定制器业务含义，不再决定 metafield 表单能否加载。页面按 definition 顺序为每个 Variant 动态生成控件：

- `file_reference` 且引用图片：Shopify 原生图片选择器；
- 单行/多行文本、URL、数字、日期等标量：匹配的 HTML 输入控件；
- 布尔类型：复选框；
- JSON、列表和当前未专门适配的类型：JSON/原始值编辑器，并在提交前做基本格式校验；
- 只读或应用无权写入的 definition：展示但不允许保存。

- `GET /api/shopify/customization-variants?productGid=...&optionId=...`
- `PUT /api/shopify/customization-variants`

读取接口同时返回 definitions 与每个 Variant 的当前值。写入接口只接受本次读取到的 definition 身份和类型，校验 Product/Variant 归属，通过 `metafieldsSet` 分批更新。空值默认不删除已有字段；显式清除必须作为独立操作，避免批量覆盖已有数据。

## 前台可见控制

绑定页根据实时读取到的 definitions 动态展示“SKU 步骤前台可见字段”复选框，不写死名称。勾选结果以 `namespace.key` 白名单保存在当前商品绑定记录中，默认空列表；因此新增或已有的内部 metafield 不会自动进入公开响应。

Storefront 配置接口仅查询并返回白名单内的 definitions 和当前商品各 Variant 的值，支持遍历全部 Variant。定制器根据当前所选 Variant，在 SKU 摘要下按 definition 名称展示所有有值字段；图片引用显示缩略图，布尔和列表值转为可读文本。切换 SKU 时同步刷新，未勾选或空值字段不渲染。

## 面料库演进边界

未来面料库记录负责可复用主数据，如编号、成分、描述和缩略图；商品/版型特有的合图底图仍可保留为 Variant 覆盖值。绑定页可增加“选择面料”动作，将面料库值投影到当前动态字段表单，再由用户确认保存。动态 metafield 渲染层保持不变。

## 验证

```bash
npm run lint
npm run test:unit
npm run build
```

人工验证：在 Shopify Admin 内打开应用，选择一个商品并读取 Variant；确认页面字段与 Shopify `PRODUCTVARIANT` definitions 一致；分别修改文本、布尔、数字、JSON 和图片字段并保存；刷新 Variant 元字段页确认写入。新增一个测试 definition 后重新读取，字段应自动出现，无需发布代码。

## 上线与回滚

先部署 Worker，再验证管理端写入，最后检查现有主题。回滚代码不会删除已写入的 Variant metafield。旧字段定义删除时仅限定 `PRODUCTVARIANT/custom/material_composite_base`，其关联旧值一并删除。
