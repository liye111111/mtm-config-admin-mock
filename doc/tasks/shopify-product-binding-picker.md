# Shopify 商品选择与模板绑定任务

## 1. 任务信息

- 状态：已完成首版开发，待 Shopify Admin 联调
- 优先级：P0
- 目标阶段：商品绑定完善
- 前置能力：Schema v2 模板、模板发布版本、基础商品绑定 CRUD
- 暂缓能力：高级选项关系编辑器

## 2. 背景

当前商品绑定页面需要运营人员手工填写 Shopify Product ID、商品标题和 Handle。该方式存在以下问题：

- 容易填写错误或绑定其他店铺的商品；
- 商品标题、主图、Handle 和状态可能与 Shopify 不一致；
- 无法直接搜索店铺商品；
- 无法确认商品是否存在可售 Variant；
- 浏览器提交的数据不能作为可信商品数据；
- 页面体验与 Shopify Admin 不一致。

后台页面当前通过 Shopify Admin 应用入口打开，并由 Cloudflare Worker 提供嵌入页面。因此应使用 Shopify App Bridge Resource Picker 选择商品，再由 CF 服务端通过 Admin GraphQL API重新获取并验证商品。

## 3. 目标

在 Shopify Admin 嵌入应用中提供官方商品选择器，使运营人员能够：

1. 搜索当前店铺的 Shopify 商品；
2. 查看商品主图、名称和基本状态；
3. 选择一个普通单品或普通套装商品；
4. 为商品绑定一个已发布的定制模板；
5. 指定模板发布版本或跟随最新发布版本；
6. 启用或停用该商品的定制能力；
7. 查看 Shopify 同步状态；
8. 打开对应 Shopify 商品后台；
9. 预览 Storefront 最终配置。

本任务不通过定制后台修改 Shopify 商品价格、SKU、Variant 或库存。

## 4. 核心流程

```text
运营人员点击“选择 Shopify 商品”
→ CF 嵌入页面调用 App Bridge Resource Picker
→ Shopify Admin 展示官方商品搜索与选择界面
→ Resource Picker 返回 Product GID 和展示信息
→ 页面选择定制模板、发布版本及启停状态
→ 页面携带 Shopify Session Token 请求 CF API
→ CF 验证 Session Token 和当前店铺
→ CF 使用店铺 Admin API Access Token 查询 Product
→ CF 校验商品、Variant 和模板兼容性
→ CF 保存可信商品缓存和模板绑定
→ Storefront 按数字 Product ID 获取已发布配置
```

## 5. Shopify 嵌入环境

### 5.1 应用入口

正式页面必须通过 Shopify Admin 应用入口打开：

```text
https://admin.shopify.com/store/{store}/apps/{app-handle}
```

直接访问 `workers.dev` 地址时不具备完整 App Bridge 上下文，不允许创建正式商品绑定。

### 5.2 App Bridge

CF 页面需要加载 Shopify App Bridge，并提供应用 Client ID：

```html
<meta name="shopify-api-key" content="{SHOPIFY_APP_CLIENT_ID}">
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
```

React 页面通过 App Bridge 调用：

```ts
const selected = await shopify.resourcePicker({
  type: "product",
  multiple: false,
  filter: {
    variants: false
  }
});
```

Resource Picker 负责 Shopify 商品搜索、缩略图、标题展示和选择交互。

### 5.3 权限

应用至少需要：

```text
read_products
```

权限变化后需要完成应用重新授权。

## 6. 页面设计

### 6.1 商品绑定列表

列表字段：

- 商品主图；
- Shopify 商品名称；
- Product ID；
- Handle；
- 商品类型：普通单品／普通套装；
- Shopify 状态；
- Variant 数量；
- 绑定模板；
- 指定发布版本；
- 定制启停状态；
- Shopify 同步状态；
- 最后同步时间；
- 更新时间。

列表操作：

- 新建绑定；
- 编辑绑定；
- 启用／停用；
- 解除绑定；
- 重新同步 Shopify 商品；
- 打开 Shopify 商品后台；
- 预览 Storefront 配置。

### 6.2 商品选择区域

未选择商品：

```text
┌──────────────────────────────────────┐
│ 尚未选择 Shopify 商品                │
│ [选择 Shopify 商品]                  │
└──────────────────────────────────────┘
```

已选择商品：

```text
┌──────────────────────────────────────────────┐
│ [主图]  男士商务西服三件套                   │
│         Product ID: 10296845205799            │
│         mens-three-piece-suit                 │
│         ACTIVE · 12 个 Variants               │
│                              [重新选择商品]   │
└──────────────────────────────────────────────┘
```

商品标题、图片、Handle 和状态为只读字段。

### 6.3 模板绑定区域

字段：

- 商品类型；
- 已发布定制模板；
- 发布版本；
- 启用商品定制；
- 同步状态说明。

模板下拉框只展示已发布模板。发布版本下拉框只展示所选模板的不可变发布版本。

## 7. 商品类型

本任务使用以下业务类型：

```ts
type BoundProductKind = "single" | "suite";
```

- `single`：普通 Shopify 单品商品，对应单品定制模板；
- `suite`：普通 Shopify 套装商品，对应组合定制模板。

该字段描述本项目业务语义，不代表使用 Shopify Fixed Bundle。

## 8. Domain 模型

建议将商品绑定扩展为：

```ts
type ProductTemplateBinding = {
  id: string;
  shopId: string;

  shopifyProductGid: string;
  shopifyProductId: string;
  productTitle: string;
  productHandle: string;
  productImageUrl?: string;
  productImageAlt?: string;
  productStatus: "ACTIVE" | "DRAFT" | "ARCHIVED";
  productKind: "single" | "suite";
  variantCount: number;
  onlineStoreUrl?: string;
  shopifyAdminUrl?: string;

  templateId: string;
  publishedVersion: number | null;
  enabled: boolean;

  syncStatus: "synced" | "stale" | "error";
  syncError?: string;
  shopifyUpdatedAt?: string;
  lastSyncedAt?: string;

  createdAt: string;
  updatedAt: string;
};
```

同时保存两种 Shopify ID：

- `shopifyProductGid`：Admin GraphQL 使用；
- `shopifyProductId`：Liquid `product.id` 和 Storefront 配置查询使用。

## 9. D1 调整

`product_bindings` 建议新增：

```text
shop_id
shopify_product_gid
product_image_url
product_image_alt
product_status
product_kind
variant_count
online_store_url
shopify_admin_url
sync_status
sync_error
shopify_updated_at
last_synced_at
```

约束：

- `(shop_id, shopify_product_gid)` 唯一；
- `(shop_id, shopify_product_id)` 唯一；
- Product ID 不得跨店铺查询或复用；
- `template_id` 必须指向存在的模板；
- `published_version` 为空表示跟随最新发布版本；
- 历史订单快照不依赖当前商品缓存字段。

项目不兼容旧数据，本地开发库可以按新结构重新初始化。

## 10. CF Admin API

### 10.1 获取绑定列表

```http
GET /api/admin/product-bindings
Authorization: Bearer {Shopify Session Token}
```

只返回当前 Session Token 对应店铺的绑定。

### 10.2 获取单个绑定

```http
GET /api/admin/product-bindings/{id}
Authorization: Bearer {Shopify Session Token}
```

### 10.3 创建绑定

```http
POST /api/admin/product-bindings
Authorization: Bearer {Shopify Session Token}
Content-Type: application/json
```

浏览器只提交选择结果和绑定意图：

```json
{
  "shopifyProductGid": "gid://shopify/Product/10296845205799",
  "productKind": "suite",
  "templateId": "mens-three-piece-suit-v1",
  "publishedVersion": 1,
  "enabled": true
}
```

浏览器不提交可信商品标题、图片、状态或 Variant 数量。

### 10.4 更新绑定

```http
PUT /api/admin/product-bindings/{id}
Authorization: Bearer {Shopify Session Token}
```

允许修改：

- `productKind`；
- `templateId`；
- `publishedVersion`；
- `enabled`。

更换 Shopify Product 应使用明确的重新选择操作，并再次查询 Shopify。

### 10.5 重新同步

```http
POST /api/admin/product-bindings/{id}/sync
Authorization: Bearer {Shopify Session Token}
```

重新从 Shopify 获取标题、Handle、主图、状态、Variant 数量和更新时间。

### 10.6 删除绑定

```http
DELETE /api/admin/product-bindings/{id}
Authorization: Bearer {Shopify Session Token}
```

删除绑定不删除模板、定制实例或历史订单快照。

### 10.7 Storefront 预览

```http
GET /api/admin/product-bindings/{id}/storefront-preview
Authorization: Bearer {Shopify Session Token}
```

返回该绑定当前会提供给 Storefront 的配置，只用于后台预览。

## 11. Shopify Admin GraphQL

CF 保存或同步绑定时，根据 Product GID 查询：

```graphql
query ProductForBinding($id: ID!) {
  product(id: $id) {
    id
    legacyResourceId
    title
    handle
    status
    featuredMedia {
      preview {
        image {
          url
          altText
        }
      }
    }
    variantsCount {
      count
    }
    variants(first: 10) {
      nodes {
        id
        legacyResourceId
        sku
        title
        availableForSale
      }
    }
    onlineStoreUrl
    updatedAt
  }
}
```

若 Variant 总数超过首批查询数量，至少需要可靠判断是否存在可用于加购的 Variant，不要求将全部 Variant 缓存到 D1。

## 12. 保存校验

保存商品绑定时必须校验：

1. Shopify Session Token 有效；
2. Product 属于当前店铺；
3. Product 存在且未归档；
4. 至少存在一个可以使用的 Variant；
5. 同一店铺 Product 未被其他绑定占用；
6. 模板已经发布；
7. 指定发布版本存在；
8. `single` 商品绑定单品模板；
9. `suite` 商品绑定组合模板；
10. 组合模板包含且只包含一个启用的 `components` 步骤；
11. 组合模板所有启用组件均绑定已发布的同品类单品模板。

服务端不得信任浏览器传入的 Product 标题、Handle、图片、状态或 Variant 信息。

## 13. 安全要求

- Admin API 必须验证 Shopify Session Token；
- 店铺身份从 Token 获取，不从请求 Body 获取；
- Admin API Access Token 只保存在服务端 Secret 或受保护的安装会话中；
- 每个 Repository 查询强制包含 `shop_id`；
- 不允许通过修改绑定 ID 访问其他店铺的数据；
- GraphQL 查询使用变量，不拼接 Product GID；
- API 响应不返回 Admin Access Token；
- 日志不记录 Session Token 或 Access Token；
- 创建、修改、同步和删除绑定进入审计日志；
- 同步接口按店铺和用户限流。

## 14. 本地开发降级

直接访问本地页面时没有 Shopify App Bridge 上下文。开发模式提供 Mock 商品选择器：

- 使用固定 Mock 商品清单；
- 展示与正式商品卡片相同的字段；
- 明确显示“Mock 商品”标记；
- Mock 数据不能在生产环境启用；
- 生产环境不得退回手工填写可信商品信息。

建议环境判断：

```text
Shopify Embedded Admin + App Bridge 可用
→ 官方 Resource Picker

本地开发环境
→ Mock Resource Picker

生产环境但 App Bridge 不可用
→ 禁止创建绑定并显示配置错误
```

## 15. 错误处理

| 场景 | HTTP | 页面提示 |
| --- | --- | --- |
| Session Token 无效 | `401` | Shopify 会话已失效，请重新打开应用 |
| 用户无商品读取权限 | `403` | 当前用户无权读取 Shopify 商品 |
| Product 不存在 | `404` | 商品不存在或已被删除 |
| Product 已绑定 | `409` | 该商品已经绑定定制模板 |
| 模板版本已失效 | `409` | 模板版本已变化，请重新选择 |
| 商品与模板类型不匹配 | `422` | 普通套装必须绑定组合模板 |
| 没有可用 Variant | `422` | 商品没有可用于加购的 Variant |
| Shopify API 暂时失败 | `502` | 无法读取 Shopify 商品，请稍后重试 |
| 超过 Shopify API 限流 | `429/503` | Shopify 请求繁忙，请稍后重试 |

## 16. 实施阶段

### 阶段 A：Domain 与 D1

1. 扩展 Product Binding Domain；
2. 更新 Zod Schema；
3. 更新 D1 和 Drizzle Schema；
4. 更新 Repository 的店铺隔离查询；
5. 初始化新的本地开发数据。

### 阶段 B：Shopify 应用基础能力

1. 接入 App Bridge；
2. 增加 Shopify Session Token 验证；
3. 建立店铺安装会话和 Admin Access Token 读取；
4. 建立 Shopify Admin GraphQL Client；
5. 配置 `read_products` Scope。

### 阶段 C：商品选择与绑定页面

1. 接入 Resource Picker；
2. 建立已选商品展示卡片；
3. 完成模板和发布版本选择；
4. 完成绑定列表；
5. 完成启停、同步、删除和重新选择；
6. 完成本地 Mock 商品选择器。

### 阶段 D：校验与预览

1. 保存前重新查询 Shopify Product；
2. 完成商品与模板类型校验；
3. 完成 Variant 可用性校验；
4. 完成 Storefront 配置预览；
5. 完成错误状态和重试交互。

### 阶段 E：验证与文档

1. Domain 和 Service 单元测试；
2. API 集成测试；
3. Shopify Admin 嵌入场景测试；
4. Resource Picker 选择和取消测试；
5. 跨店铺隔离测试；
6. README、CF API 和 Shopify 对接文档同步。

## 17. 验收标准

- 从 Shopify Admin 应用入口可以打开商品选择器；
- 选择器由 Shopify 官方 Resource Picker 提供；
- 可以通过商品名称搜索并选择一个商品；
- 选择后显示主图、名称、Product ID、Handle、状态和 Variant 数量；
- 页面不能手工修改 Shopify 商品缓存字段；
- 保存时 CF 会通过 Admin GraphQL 重新读取商品；
- 商品只能绑定兼容类型的已发布模板；
- 可以指定模板发布版本或跟随最新版；
- 可以启用或停用商品定制；
- Product 不得在同一店铺重复绑定；
- 不同店铺的数据严格隔离；
- 可以重新同步商品信息；
- 可以打开 Shopify 商品后台；
- 可以预览 Storefront 配置；
- 本地开发使用明确标识的 Mock 选择器；
- 生产环境 App Bridge 不可用时禁止创建绑定；
- Lint、类型检查、构建和自动测试通过；
- 不暴露 Session Token、Admin Access Token 或 App Secret。

## 18. 非目标

本任务不包括：

- 修改 Shopify 商品标题或主图；
- 修改价格、SKU、Variant 或库存；
- 创建 Shopify Product；
- 使用 Shopify Fixed Bundle；
- 高级选项关系编辑器；
- 客户量体、定制实例和订单快照页面；
- ERP／MTM 同步实现。

## 19. 开始实施前确认

开始编码前需要确认：

- Shopify 应用 Client ID；
- 应用正式 Handle；
- CF 正式和测试 URL；
- `read_products` 是否已授权；
- 店铺安装会话和 Admin Access Token 当前保存位置；
- 本地 Mock 商品清单；
- 普通单品／普通套装是由运营选择，还是通过 Shopify Metafield 判断。
