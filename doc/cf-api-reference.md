# Cloudflare API 契约

## 1. 文档目的

本文单独定义 MTM 定制系统部署在 Cloudflare Worker 上的 HTTP API，包括：

- Shopify 商品页使用的 Storefront API；
- Shopify Admin 嵌入应用使用的管理 API；
- Shopify Webhook 接收接口；
- ERP／MTM 服务端集成接口。

本文以新的 Schema v2 Domain 为准，不兼容旧模板或旧数据结构。

## 2. API 边界

CF API 负责模板读取、定制规则校验、完整定制实例保存、订单快照和外部系统集成。它不负责 Shopify 商品售价、Variant、SKU、库存或购物车本身。

```text
Shopify Liquid
  └─ 输出当前 Product 和 Variant/SKU 数据

Shopify 商品页 JavaScript
  ├─ 通过 App Proxy 调用 CF Storefront API
  └─ 使用 variant.id 调用 Shopify /cart/add.js

Cloudflare Worker + D1
  ├─ 管理定制模板及商品绑定
  ├─ 校验并保存完整定制实例
  ├─ 接收 Shopify 订单 Webhook
  └─ 保存不可变订单快照供 ERP／MTM 使用
```

## 3. 路径约定

Worker 原始地址示例：

```text
https://mtm-config.example.workers.dev
```

商品页正式环境推荐通过 Shopify App Proxy 使用同源路径：

```text
店铺请求：/apps/mtm-config/storefront/config/{productId}
代理到 CF：/api/storefront/config/{productId}
```

本文接口统一列出 CF 原始路径。主题调用时将 `/api/storefront` 映射为 `/apps/mtm-config/storefront`。

## 4. 鉴权模型

| API 类型 | 调用方 | 鉴权方式 |
| --- | --- | --- |
| Storefront | Shopify 商品页 | Shopify App Proxy HMAC、时间戳和店铺校验 |
| Admin | Shopify Admin 嵌入应用 | Shopify Session Token/JWT、店铺及角色校验 |
| Webhook | Shopify | Shopify Webhook HMAC、Topic 和 Shop 校验 |
| ERP／MTM | 外部服务端 | Bearer Token；生产环境建议增加 HMAC、时间戳和 Nonce |
| Health | 监控系统 | 仅返回非敏感状态；详细诊断需要内部凭证 |

禁止把固定 Token、Shopify App Secret 或 ERP 密钥写入 Liquid、HTML、主题 JavaScript或 Git。服务端密钥使用 Cloudflare Worker Secrets 保存。

## 5. Storefront API

### 5.1 获取商品定制配置

```http
GET /api/storefront/config/{productId}
Accept: application/json
```

`productId` 是当前 Shopify Product ID。请求经 App Proxy 时，Worker 还必须验证 `shop`、`timestamp` 和 `signature`。

未启用定制：

```json
{
  "enabled": false,
  "configuration": null
}
```

已启用定制：

```json
{
  "enabled": true,
  "configuration": {
    "schemaVersion": 2,
    "templateId": "mens_suit_v1",
    "version": 3,
    "productId": "8123456789012",
    "buttonLabel": "开始定制",
    "templateType": "composite",
    "pricingMode": "none",
    "orderLineMode": "single_line",
    "components": [
      {
        "id": "component_jacket",
        "code": "jacket",
        "name": "西服上衣",
        "category": "jacket",
        "childTemplateId": "template_jacket",
        "customizationEnabled": true,
        "required": true,
        "sortOrder": 10,
        "template": {
          "templateId": "mens_jacket_v1",
          "version": 2,
          "schemaVersion": 2,
          "templateType": "single",
          "components": [],
          "steps": [],
          "measurementBlocks": []
        }
      }
    ],
    "steps": [],
    "measurementBlocks": []
  }
}
```

规则：

- 只返回已发布模板和商品当前绑定的发布版本；
- 绑定不存在、绑定停用或模板未发布时返回 `200 + enabled:false`；
- 不返回草稿、审计信息、密钥或其他店铺数据；
- 组合模板返回固定逻辑组件，前端不得让消费者增删组件；
- Shopify Variant/SKU 不由该接口返回，商品页从 Liquid 的 `product.variants` 获取。

### 5.2 预校验定制选择

```http
POST /api/storefront/validate
Content-Type: application/json
Accept: application/json
```

用途：在提交前为前端提供业务规则反馈。该接口无副作用，不创建正式定制实例，也不产生可跳过最终校验的凭证。

请求：

```json
{
  "productId": "8123456789012",
  "variantId": "45123456789012",
  "templateId": "mens_suit_v1",
  "configVersion": 3,
  "selections": {
    "fabric": "navy_wool_120",
    "components": {
      "jacket": {
        "lapel": "notch_lapel",
        "buttons": "single_2"
      },
      "trousers": {
        "pleat": "flat"
      }
    },
    "measurements": {
      "chest": 98,
      "waist": 84
    }
  }
}
```

成功：

```json
{
  "valid": true,
  "errors": [],
  "configVersion": 3,
  "validatedAt": "2026-07-24T10:30:00Z"
}
```

校验失败：

```json
{
  "valid": false,
  "errors": [
    {
      "code": "OPTION_CONFLICT",
      "path": "components.jacket.lapel",
      "stepCode": "jacket_style",
      "fieldCode": "lapel",
      "message": "戗驳领不能与当前门襟组合使用"
    }
  ],
  "configVersion": 3
}
```

服务端校验至少包括：

- 商品绑定已启用且模板版本有效；
- Variant 属于当前 Product；
- 必填步骤和固定组件完整；
- 选项编码存在、启用且属于对应步骤；
- 选项关系没有冲突；
- 量体字段、单位和范围有效；
- 客户只能引用自己的量体档案。

模板版本已经变化时返回 `409 CONFIG_VERSION_OUTDATED`，前端应重新获取配置。

### 5.3 创建完整定制实例

```http
POST /api/storefront/customizations
Content-Type: application/json
Idempotency-Key: 01K123XYZ
```

用途：执行最终权威校验，并在 D1 中保存完整、可追踪的定制实例。请求主体与预校验接口一致。

成功：

```json
{
  "customizationId": "cust_01K123XYZ",
  "status": "validated",
  "configVersion": 3,
  "summary": "藏青色 / 48 / 平驳领 / 单排两粒扣"
}
```

规则：

- 必须重新执行完整校验，不能信任之前的 `/validate` 结果；
- 使用 `Idempotency-Key` 防止重复点击创建多个实例；
- 保存模板版本、固定组件、选项编码与名称、量体数据和商品引用；
- `customizationId` 必须不可猜测；
- 响应只返回购物车展示所需的摘要和引用 ID。

创建成功后，主题调用 Shopify Ajax Cart API：

```json
{
  "items": [
    {
      "id": 45123456789012,
      "quantity": 1,
      "properties": {
        "定制摘要": "藏青色 / 48 / 平驳领 / 单排两粒扣",
        "_mtm_customization_id": "cust_01K123XYZ",
        "_mtm_template": "mens_suit_v1@3"
      }
    }
  ]
}
```

完整配置和敏感量体数据只保存在 D1，不写入 Line Item Properties。

### 5.4 客户量体档案（后续阶段）

```http
GET    /api/storefront/measurement-profiles
POST   /api/storefront/measurement-profiles
GET    /api/storefront/measurement-profiles/{id}
PUT    /api/storefront/measurement-profiles/{id}
DELETE /api/storefront/measurement-profiles/{id}
```

这些接口必须要求可信客户身份，并根据 App Proxy 的 `logged_in_customer_id` 做对象级权限校验。匿名用户不得读取客户量体档案。

## 6. Admin API

所有 Admin API 必须验证 Shopify Session Token，并从 Token 得到店铺和用户身份。禁止仅依据请求参数中的 `shop` 判断权限。

### 6.1 模板

```http
GET    /api/templates
POST   /api/templates
GET    /api/templates/{id}
PUT    /api/templates/{id}
DELETE /api/templates/{id}
POST   /api/templates/{id}/publish
GET    /api/templates/{id}/versions
```

职责：

- 管理 Schema v2 模板基础信息；
- 管理固定逻辑组件、步骤、选项和量体块；
- 发布前执行完整 Domain 校验；
- 发布后生成不可变版本；
- 已被订单引用的历史版本不得修改或删除。

### 6.2 商品绑定

```http
GET /api/products
GET /api/products/{id}
PUT /api/products/{id}
```

绑定请求示例：

```json
{
  "templateId": "template_suit",
  "publishedVersion": 3,
  "enabled": true
}
```

Shopify 商品价格、SKU 和库存只读，不通过该接口编辑。

### 6.3 后续管理接口

```http
GET /api/admin/customizations
GET /api/admin/customizations/{id}
GET /api/admin/orders
GET /api/admin/orders/{id}
GET /api/admin/measurement-profiles
GET /api/admin/measurement-profiles/{id}
GET /api/admin/audit-logs
```

定制实例、订单快照默认只读。量体和客户信息必须做角色权限、字段最小化和审计记录。

## 7. Shopify Webhook API（后续阶段）

```http
POST /api/webhooks/shopify/orders-create
POST /api/webhooks/shopify/orders-updated
POST /api/webhooks/shopify/app-uninstalled
```

`orders/create` 处理流程：

```text
验证 Webhook HMAC
→ 检查 Webhook ID 幂等性
→ 从 Line Item Property 读取 customizationId
→ 查询 D1 完整定制实例
→ 生成不可变 OrderCustomizationSnapshot
→ 关联 Shopify Order 和 Line Item
→ 进入 ERP／MTM 同步队列
```

Webhook 处理必须幂等；不能使用商品标题、SKU 或消费者可读摘要重建生产数据。

## 8. ERP／MTM API（后续阶段）

```http
GET  /api/integrations/erp/order-snapshots
GET  /api/integrations/erp/order-snapshots/{id}
POST /api/integrations/erp/order-snapshots/{id}/acknowledge
```

返回数据以不可变订单快照为准，包括：

- Shopify Order、Line Item、Product、Variant 和 SKU 引用；
- 模板代码和发布版本；
- 全部固定逻辑组件；
- 每个组件的选项编码和下单时名称；
- 生产所需量体数据；
- 创建时间、同步状态和快照版本。

ERP／MTM 调用使用服务端凭证，建议签名内容包含：

```text
HTTP_METHOD
REQUEST_PATH
TIMESTAMP
NONCE
SHA256(BODY)
```

Worker 验证时间窗口、Nonce、防重放签名和客户端权限。

## 9. 通用响应和错误

成功响应使用对应业务对象。失败响应统一为：

```json
{
  "error": {
    "code": "CONFIG_VERSION_OUTDATED",
    "message": "配置版本已更新，请刷新后重试",
    "requestId": "req_01K123XYZ",
    "details": []
  }
}
```

| HTTP 状态 | 语义 |
| --- | --- |
| `200` | 查询或校验完成 |
| `201` | 定制实例等资源创建成功 |
| `400` | 请求格式或字段非法 |
| `401` | 缺少或无法验证身份 |
| `403` | 身份有效但无权访问对象 |
| `404` | 资源不存在 |
| `409` | 模板版本过期、幂等冲突或状态冲突 |
| `413` | 请求体过大 |
| `422` | 业务规则校验失败 |
| `429` | 超过限流阈值 |
| `500` | D1 或服务端异常 |

`enabled:false` 只表示商品没有有效定制绑定，不能用来掩盖数据库或程序异常。

## 10. 安全要求

- Storefront 写接口统一通过 App Proxy；
- App Proxy 验证 HMAC、时间戳、店铺安装状态和客户对象归属；
- Admin 验证 Session Token、店铺和角色；
- Webhook 验证原始请求体 HMAC；
- ERP／MTM 使用可轮换、可吊销的独立服务凭证；
- 所有查询强制带可信 `shopId`，防止跨店铺读取；
- `/validate` 和 `/customizations` 复用同一个 Domain 校验器；
- 对 IP、店铺、客户和接口分别限流；
- 设置请求体大小、数组长度、字符串长度和嵌套深度限制；
- 日志不得记录 Token、完整量体或完整客户隐私数据；
- 管理操作、敏感读取和 ERP 重试写入审计日志；
- CORS 不是身份认证，只作为浏览器访问限制；
- Secret 只存储在 Cloudflare Worker Secrets。

## 11. 当前实现状态

| 接口 | 状态 |
| --- | --- |
| `GET /api/health` | 已实现 |
| `GET /api/storefront/config/{productId}` | 已实现 Schema v2 |
| `POST /api/storefront/validate` | 已实现基础校验，需继续补齐 Variant、关系和量体校验 |
| `POST /api/storefront/customizations` | 待实现 |
| 模板 CRUD、发布、版本 API | 已实现阶段一能力 |
| 商品绑定 API | 已实现阶段一能力 |
| 客户量体 API | 待后续阶段实现 |
| Shopify Webhook API | 待后续阶段实现 |
| ERP／MTM API | 待后续阶段实现 |
| App Proxy HMAC 和 Admin Session Token | 正式上线前实施 |

当前主题仍可使用 `/validate` 后直接加入购物车，但这不代表已经形成生产级完整定制实例。正式流程必须在加购前调用 `/customizations` 并把返回的 `customizationId` 写入 Line Item Properties。
