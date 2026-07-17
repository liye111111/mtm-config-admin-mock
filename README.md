# MTM Config Admin Mock

Shopify 服装定制配置 POC，运行在 Cloudflare Worker，包含 React 管理页面、API 和 D1 持久化。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。首次请求会自动创建本地 D1 表并写入“男士西服定制”种子模板。

## API

- `GET /api/health`
- `GET|POST /api/templates`
- `PUT /api/templates/:id`
- `POST /api/templates/:id/publish`
- `GET /api/storefront/config/:productId`
- `POST /api/storefront/validate`

POC 商品 ID 为 `10296845205799`。

## Cloudflare 部署

1. 创建 D1 数据库 `mtm-config-poc`。
2. 在 Worker Builds 的构建变量中设置 `D1_DATABASE_ID` 为数据库 ID。
3. Build command 使用 `npm run build`。
4. Deploy command 使用 `npx wrangler deploy --config dist/server/wrangler.json`。
5. Worker 项目名必须为 `mtm-config-admin-mock`。

生产部署前应将 Storefront CORS 从 `*` 收紧到 Shopify 正式域名，并为管理写接口增加鉴权。
