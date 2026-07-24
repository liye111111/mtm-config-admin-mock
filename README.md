# MTM Config Admin Mock

Shopify 服装定制配置 POC，运行在 Cloudflare Worker，包含 React 管理页面、API 和 D1 持久化。

## 后端结构

```text
app/api/                 # HTTP Route 薄适配层（等价于 routes/）
src/
├── domain/              # 领域模型和 API View 转换
├── services/            # 模板、商品绑定和店面配置业务逻辑
├── repositories/        # D1 初始化、查询和持久化
├── schemas/             # Zod Schema、HTTP 请求解析与运行时校验
├── integrations/        # Shopify 等外部系统访问边界
├── middleware/          # CORS、错误映射和统一响应
└── shared/              # 公共错误类型等基础能力
worker/                  # Cloudflare Worker/Vinext 运行入口
db/                      # Drizzle schema 和迁移定义
app/                     # React 管理页面
```

依赖方向为：

```text
app/api -> schemas/services -> repositories -> D1
                         └──> integrations -> Shopify Admin API
```

Route 中不直接编写 SQL 或业务规则。外部输入在 `schemas` 中通过 Zod 校验并推导 TypeScript 类型，业务规则集中于 `services`，D1 操作集中于 `repositories`。

## 当前 Domain 基线

管理端和 API 只支持 Template Schema v2：

```text
TemplateConfig
├── components             # 套装固定逻辑组件
├── steps                  # 定制步骤及选项
└── measurementBlocks      # 尺寸块及字段
```

旧 `pieces`、`pieceSelection` 和平铺 `measurementFields` 数据不兼容，也没有运行时转换逻辑。升级已有环境前必须备份旧 D1，并按新版模型重新初始化或录入模板。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。首次请求会自动创建本地 D1 表并写入“男士西服定制”种子模板。

提交代码前执行：

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## API

- `GET /api/health`
- `GET|POST /api/templates`
- `PUT /api/templates/:id`
- `POST /api/templates/:id/publish`
- `GET /api/storefront/config/:productId`
- `POST /api/storefront/validate`

CF 对外接口、鉴权、请求响应及实施状态见 [`doc/cf-api-reference.md`](doc/cf-api-reference.md)。Shopify 认证、普通套装商品、Ajax Cart、Line Item Properties、D1 配置快照和订单 Webhook 的完整对接约定见 [`doc/shopify-integration-api.md`](doc/shopify-integration-api.md)。

Storefront 配置接口使用 `enabled + configuration` 响应；绑定停用、商品无绑定或模板未发布时返回 HTTP 200 和 `enabled:false`。

POC 商品 ID 为 `10296845205799`。

## Cloudflare 部署

1. 创建 D1 数据库 `mtm-config-poc`。
2. 在 Worker Builds 的构建变量中设置 `D1_DATABASE_ID` 为数据库 ID。
3. Build command 使用 `npm run build`。
4. Deploy command 使用 `npx wrangler deploy --config dist/server/wrangler.json`。
5. Worker 项目名必须为 `mtm-config-admin-mock`。

生产部署前应将 Storefront CORS 从 `*` 收紧到 Shopify 正式域名，并为管理写接口增加鉴权。
