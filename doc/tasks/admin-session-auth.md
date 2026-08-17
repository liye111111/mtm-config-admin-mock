# 管理 API Shopify Session Token 鉴权

## 背景与目标

Cloudflare Worker 的管理页面和 API 具有公网入口。商品绑定接口已经校验 Shopify Session Token，但模板、模板品类和量体资料管理接口此前可在没有管理会话的情况下调用。

本任务为全部管理 API 增加统一 Session Token 门禁，并确保量体资料只能由 Token 所属店铺访问。Storefront App Proxy、Shopify Webhook 和健康检查保持现有鉴权方式不变。

## 涉及范围

- `src/middleware/http.ts`：新增统一的 `adminRoute` 边界。
- `app/api/templates/**`：所有读写接口接入管理会话鉴权。
- `app/api/template-categories/**`：所有读写接口接入管理会话鉴权。
- `app/api/measurement-profiles/**`：接入管理会话鉴权和店铺隔离。
- `src/services/measurement-profile-service.ts`、`src/repositories/measurement-profile-repository.ts`：把 Token 店铺身份加入查询、更新和删除条件。

## API 行为变化

- 未携带 `Authorization: Bearer <Shopify Session Token>` 的管理请求返回 HTTP 401。
- Token 无效、过期或店铺身份无效时返回 HTTP 401。
- 量体资料请求中的 `shopId` 与 Token 店铺不一致时返回 HTTP 403。
- 查询或操作其他店铺的量体资料时按资源不存在处理，返回 HTTP 404。
- 本地开发仍可从 localhost 使用现有的 `X-MTM-Mock-Shopify: 1` 模式。

## 数据库与配置

本任务不修改数据库结构，也不新增环境变量。模板和模板品类表当前没有 `shop_id` 字段，因此本阶段只增加 Session Token 门禁；若应用未来支持多店铺安装，需要另行增加模板数据的租户字段与迁移。

## 验证

```bash
npx tsc --noEmit
npm run lint
npm test
```

人工验证至少覆盖：无 Token 返回 401、有效 Shopify Admin 会话正常读取和写入、跨店铺量体资料写入返回 403，以及 Storefront 与 Webhook 路径行为不变。

## 上线与回滚

上线前确认 Worker Secrets 中的 `SHOPIFY_CLIENT_ID` 和 `SHOPIFY_CLIENT_SECRET` 与正式应用一致。若鉴权配置错误导致管理端不可用，可回滚 Worker 部署版本；不得通过移除服务端鉴权临时恢复访问。

## 后续风险

- 当前仅识别合法 Shopify 店铺会话，尚未区分店铺人员角色。
- 模板与模板品类尚未实现多店铺数据隔离。
- 生产环境仍需收紧 Storefront CORS、关闭非必要公开域名并增加限流与审计。
