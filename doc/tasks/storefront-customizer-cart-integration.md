# 阶段二：Shopify Storefront 定制器与购物车集成任务

## 1. 任务信息

- 状态：待实施
- 优先级：P0
- 前置条件：Schema v2 Domain、模板发布、商品绑定、远程 D1 和 Shopify Admin 联调已完成
- 目标：在 Shopify 商品页完成“读取配置 → 用户定制 → 服务端校验并保存 → 加入购物车”的完整链路
- 模型基线：普通 Shopify 单品或普通套装商品，不使用 Shopify Fixed Bundle

## 2. 背景

当前系统已经可以在管理端维护单品／组合模板，并把 Shopify 商品绑定到已发布模板。Storefront 已有配置读取和基础校验接口，但还没有生产可用的商品页定制器、完整定制实例、App Proxy 鉴权和购物车集成。

本阶段继续遵循以下销售模型：

```text
Shopify Product / Variant
  └─ 决定销售商品、基础售价、SKU 和库存

Line Item Properties
  └─ 保存可读定制摘要和稳定的 customizationId

D1 Customization Instance
  └─ 保存完整选择、量体数据、模板版本和逻辑组件快照

订单快照
  └─ 后续供 ERP／MTM 按上衣、西裤、马甲等组件拆分生产
```

套装仍作为一个普通 Shopify Variant 加入购物车，内部逻辑组件不是 Shopify 商品或 Variant。

## 3. 目标范围

本任务需要完成：

1. Shopify Theme App Extension 或主题资产中的定制入口；
2. Liquid 输出当前 Product 和 Variant／SKU 列表；
3. 通过 Shopify App Proxy 读取商品绑定的已发布配置；
4. 单品和普通套装使用统一步骤渲染框架；
5. 套装的 `components` 步骤作为一个逻辑组件占位步骤；
6. 在运行时按“组合/套装”配置依次加载组件对应的单品模板；
7. 提交前预校验；
8. 最终权威校验并保存完整定制实例；
9. 将摘要和定制实例 ID 写入 Line Item Properties；
10. 使用 Shopify Ajax Cart API 加入一个商品行；
11. 完成失败恢复、重复提交保护和基本可访问性；
12. 更新 Storefront、Shopify 和 CF API 文档。

## 4. 非目标

本任务不包括：

- Shopify Fixed Bundle、Cart Transform 或组件商品拆行；
- 动态加价、折扣或覆盖 Shopify Variant 价格；
- 高级选项显示／隐藏／互斥规则编辑器；
- Customer Account 量体档案管理页面；
- Shopify 订单 Webhook 和不可变订单快照；
- ERP／MTM API 和生产任务拆分；
- 修改 Shopify Product、Variant、SKU 或库存；
- Checkout UI Extension。

订单快照及 ERP／MTM 拆单应作为阶段三单独实施。

## 5. 核心流程

```text
Liquid 渲染当前 Product、Variant 和 SKU
→ 商品页脚本检查当前 Variant
→ 经 App Proxy 获取 Product 对应定制配置
→ 无绑定或停用时隐藏定制入口
→ 用户打开定制器
→ 按模板步骤完成单品或套装组件定制
→ POST /storefront/validate 做无副作用预校验
→ POST /storefront/customizations 做最终校验并写入 D1
→ 返回 customizationId、摘要和模板版本
→ POST /cart/add.js 加入当前 Variant
→ Line Item Properties 保存摘要和稳定关联字段
```

## 6. Liquid 数据边界

Liquid 只输出当前商品已有数据，不调用 Admin API：

```liquid
<script type="application/json" data-mtm-product-context>
{
  "productId": {{ product.id | json }},
  "handle": {{ product.handle | json }},
  "selectedVariantId": {{ product.selected_or_first_available_variant.id | json }},
  "variants": [
    {% for variant in product.variants %}
      {
        "id": {{ variant.id | json }},
        "sku": {{ variant.sku | json }},
        "title": {{ variant.title | json }},
        "available": {{ variant.available | json }},
        "price": {{ variant.price | json }}
      }{% unless forloop.last %},{% endunless %}
    {% endfor %}
  ]
}
</script>
```

约束：

- Variant ID、SKU、价格和库存以 Shopify 页面数据为准；
- 定制器不得修改或自行计算成交价；
- SKU 只用于展示和服务端快照，不作为模板或选项主键；
- Variant 切换时定制器必须同步当前 Variant。

## 7. Storefront 配置与步骤模型

### 7.1 单品模板

按模板中启用的步骤顺序直接渲染：

```text
variant → options → measurements → review
```

模板未配置某类步骤时不补写固定流程。

### 7.2 普通套装模板

组合模板的步骤仍使用统一 `CustomizationStep`。其中只配置一个 `components` 类型步骤，表示逻辑组件定制在用户流程中的位置：

```text
variant → components → measurements → review
```

`components` 步骤本身不重复保存上衣、西裤、马甲引用。Storefront 进入该步骤时读取组合模板的 `components` 配置，按 `sortOrder` 依次渲染每个启用逻辑组件对应的已发布单品模板。

消费者不得增删、替换或改变组件顺序。

## 8. CF API 工作项

### 8.1 配置读取

```http
GET /apps/mtm-config/storefront/config/{productId}
```

对应 CF：

```http
GET /api/storefront/config/{productId}
```

需要补齐：

- App Proxy `shop`、`timestamp`、`signature` 校验；
- 按可信店铺和 Product ID 查询绑定；
- 只返回启用绑定和不可变发布版本；
- 子模板递归投影并防止循环引用；
- 无定制配置返回 `200 + enabled:false`；
- CORS 收紧，不使用生产级 `*`。

### 8.2 预校验

```http
POST /apps/mtm-config/storefront/validate
```

保持无副作用，至少校验：

- Product、Variant、模板及发布版本一致；
- Variant 属于 Product 且可售；
- 必填步骤、逻辑组件和选项完整；
- 选项存在、启用且适用于对应品类；
- 数值和量体字段范围合法；
- 客户身份引用合法；
- 配置版本未过期。

### 8.3 创建定制实例

新增：

```http
POST /apps/mtm-config/storefront/customizations
Idempotency-Key: <uuid>
```

该接口必须重新执行完整校验，不能信任 `/validate` 的结果。成功后返回：

```json
{
  "customizationId": "cust_01K...",
  "status": "validated",
  "configVersion": 3,
  "summary": "藏青色 / 48 / 平驳领 / 单排两粒扣",
  "lineItemProperties": {
    "定制摘要": "藏青色 / 48 / 平驳领 / 单排两粒扣",
    "_mtm_customization_id": "cust_01K...",
    "_mtm_template": "mens_suit@3"
  }
}
```

服务端生成 Line Item Properties，浏览器不得自行构造可信内部字段。

## 9. D1 数据模型

新增纯新版 `customization_instances`，不兼容旧表：

```text
id
shop_id
shopify_product_id
shopify_variant_id
shopify_sku
template_id
template_code
template_version
schema_version
status
selection_snapshot_json
component_snapshot_json
measurement_snapshot_json
summary
idempotency_key
customer_id (nullable)
cart_token_hash (nullable)
created_at
updated_at
```

约束：

- `id` 使用不可猜测 ID；
- 同一店铺的 `idempotency_key` 唯一；
- 保存选项编码及下单时展示名称；
- 保存逻辑组件和子模板版本快照；
- 完整量体数据不得进入日志或 Line Item Properties；
- `validated` 后的生产相关快照不能随模板更新而变化。

状态首版使用：

```text
draft → validated → added_to_cart
```

本阶段至少可靠创建 `validated` 实例；`added_to_cart` 状态更新可通过加购确认接口或后续阶段补齐，但不能由未经校验的浏览器请求随意修改。

## 10. Ajax Cart 集成

定制实例创建成功后调用：

```js
await fetch(`${window.Shopify.routes.root}cart/add.js`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    items: [{
      id: selectedVariantId,
      quantity: 1,
      properties: lineItemProperties
    }]
  })
});
```

规则：

- 单品和套装均只加入一个 Shopify Cart Line；
- 不把完整 JSON、量体明细或密钥写入 Properties；
- `_mtm_customization_id` 和 `_mtm_template` 使用下划线前缀作为内部关联字段；
- 网络结果未知时先读取 `/cart.js` 检查，不直接重复创建定制实例或重复加购；
- 重复点击通过前端锁和 `Idempotency-Key` 双重保护。

## 11. 前端交互要求

- 入口按钮使用商品绑定中的 `buttonLabel`；
- 无绑定、绑定停用、Variant 不可售时不允许开始定制；
- 定制器支持关闭、返回上一步和恢复当前会话；
- 步骤顺序完全来自模板 `sortOrder`；
- 支持 `image_card`、`color_swatch`、`radio`、`select`、`text_input`；
- 必填项提供就地错误提示；
- 提交期间按钮禁用并显示进度；
- 服务端版本冲突时刷新配置并提示用户重新确认；
- 桌面和移动商品页均可操作；
- 键盘操作、焦点管理和基础 ARIA 标注可用。

## 12. 安全要求

- 正式 Storefront 写接口必须经过 Shopify App Proxy；
- 服务端验证签名、时间戳和店铺域名；
- 查询必须以可信 `shop_id` 隔离；
- 不信任浏览器传入的商品名称、SKU、模板版本或摘要；
- Variant 归属和可售状态由服务端通过 Shopify API复核；
- Idempotency Key 需要绑定店铺和请求摘要；
- 错误响应不返回密钥、完整量体数据或内部 SQL；
- 日志对 Product／Variant 可记录，对客户和量体数据最小化；
- App Proxy Secret、Admin Token 和 Client Secret 不进入主题资产。

## 13. 实施阶段

### 阶段 A：契约与 App Proxy

1. 确认 Theme 项目或创建 Theme App Extension；
2. 配置 Shopify App Proxy；
3. 实现 App Proxy 签名、店铺和时间戳验证；
4. 收紧 Storefront API 店铺隔离和 CORS。

### 阶段 B：定制实例 Domain 与 D1

1. 新增 Customization Instance Domain；
2. 新增 Zod 输入 Schema；
3. 新增 D1 表、Repository 和 Service；
4. 实现 Idempotency；
5. 复用统一权威校验器。

### 阶段 C：商品页定制器

1. Liquid 输出 Product／Variant 上下文；
2. 加载 Storefront 配置；
3. 实现统一步骤渲染器；
4. 实现组合模板 `components` 步骤；
5. 实现校验、错误提示和 Review。

### 阶段 D：创建实例与购物车

1. 创建完整定制实例；
2. 使用服务端生成的 Line Item Properties；
3. Ajax Cart 加购；
4. 完成重复提交和失败恢复；
5. 验证购物车及 Checkout 展示。

### 阶段 E：验证与文档

1. Domain 与 API 测试；
2. App Proxy 签名和跨店铺测试；
3. 单品、两件套、三件套端到端测试；
4. 移动端和可访问性检查；
5. 同步 README、CF API 和 Shopify 对接文档。

## 14. 验收标准

- 无绑定商品不显示定制入口；
- 单品和套装均使用模板定义的统一步骤模型；
- 套装只存在一个 `components` 步骤且消费者不能增删组件；
- 当前 Variant 和 SKU 来自 Liquid／Shopify 商品页；
- 服务端能确认 Variant 属于当前商品且可售；
- 预校验不产生 D1 定制实例；
- 最终提交会执行权威校验并保存完整 D1 快照；
- 重复请求不会创建多个定制实例；
- 单品或套装只加入一个 Shopify Cart Line；
- Line Item Properties 只包含摘要、实例 ID 和模板版本；
- 购物车和 Checkout 能展示定制摘要；
- D1 能根据 customizationId 恢复完整逻辑组件、选项和尺寸；
- App Proxy 非法签名、过期时间戳及错误店铺请求被拒绝；
- 不暴露 Client Secret、Admin Token 或完整量体数据；
- TypeScript、Lint、构建和自动测试通过。

## 15. 开始实施前确认

- Shopify Theme 项目或 Theme App Extension 的实际目录；
- App Proxy 前缀、子路径和目标 CF URL；
- 测试店铺主题及预览方式；
- 首版是否允许游客创建定制实例；
- 量体字段首版是直接输入，还是只预留 UI；
- 购物车摘要的中文字段名称；
- 是否需要在加购成功后立即回写 `added_to_cart` 状态。
