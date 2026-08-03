# 单套客户量体资料任务

## 1. 背景与目标

一期每个 Shopify Customer 仅保存一套量体资料，用于定制器自动填充。未登录用户通过店铺首方 Cookie 中的随机 `guestId` 关联一套有效期 180 天的临时资料。

Shopify App Proxy 不向 Worker 转发店铺 Cookie，因此主题将 `guestId` 通过 `X-MTM-Guest-Id` 请求头显式传入 API，避免它出现在 URL 访问日志中；Worker 仅保存 SHA-256 哈希。登录客户的身份只使用 App Proxy 验签后的 `logged_in_customer_id`。

## 2. 涉及文件

- `db/schema.ts`、`src/repositories/database.ts`：D1 表与索引。
- `src/repositories/measurement-profile-repository.ts`：单档案查询、upsert、删除和迁移。
- `src/services/measurement-profile-service.ts`：归属、字段校验、冲突策略和 DTO。
- `src/integrations/shopify-app-proxy.ts`：返回已验证的店铺与客户身份。
- `app/api/storefront/measurement-profile/**`：Storefront API。
- Shopify Theme 中的 `assets/mtm-configurator.js`、`assets/mtm-configurator.css` 和 `blocks/mtm-configurator.liquid`：自动填充、保存、清除和冲突交互。

## 3. API 变化

```text
GET    /api/storefront/measurement-profile
PUT    /api/storefront/measurement-profile
DELETE /api/storefront/measurement-profile
GET    /api/storefront/measurement-profile/claim-status
POST   /api/storefront/measurement-profile/claim
```

正式主题通过 App Proxy 路径 `/apps/mtm-config/storefront/measurement-profile` 访问。查询与保存携带 `productId`，服务端使用该商品已发布模板的量体字段白名单、必填性、范围和步长二次校验。

## 4. D1 变化

新增 `measurement_profiles`：

- 登录资料以 `(shop_id, customer_id)` 唯一。
- 匿名资料以 `(shop_id, guest_id_hash)` 唯一。
- `customer_id` 与 `guest_id_hash` 二选一。
- 匿名记录使用 `expires_at` 过期；账号记录不过期。
- 订单仍使用 `customization_instances.measurement_snapshot_json` 保存不可变快照。

## 5. 关键决策

- 不接受前端传入 `customerId`。
- 匿名 Cookie 不保存任何量体值或 PII。
- 登录时如同时存在账号和本设备资料，由用户确认覆盖或保留。
- 资料 API 失败不阻断手工填写、定制校验和下单。
- 历史订单快照不随当前资料修改或删除。

## 6. 验证

```bash
npm run lint
npm test
```

人工验证：

1. 未登录保存后刷新页面，尺寸可自动填充。
2. 登录后可将本设备资料迁移到账号，并在其他设备恢复。
3. 账号与本设备均有资料时不静默覆盖。
4. 删除当前资料后，历史订单快照不变。
5. 伪造客户 ID、跨店铺请求和无效 App Proxy 签名无法读写资料。

## 7. 上线与回滚

- 上线前执行 D1 备份，再应用新迁移。
- 先部署 Worker API，确认路由和表已就绪，再发布主题。
- 回滚主题时可停止新读写，`measurement_profiles` 表可保留，不影响旧版定制器。
- 如必须删表，应在确认无需恢复资料后使用单独的破坏性迁移，不在应用启动过程执行。
