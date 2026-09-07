# Cloudflare 多账号目标部署

## 背景与目标

同一套 MTM Admin/API 代码需要部署到不同 Cloudflare 账号。每个目标账号拥有独立的 Worker、D1 数据库、域名和 Shopify 应用配置，部署时不得复用其他账号的资源标识或密钥。

本任务提供目标配置驱动的部署脚本，通过目标名选择 `deploy/targets/<target>.json`，完成构建、D1 migration 和 Worker 部署。

## 配置边界

目标 JSON 可以保存：

- Cloudflare Account ID；
- Worker 名称；
- D1 database name 和 database ID；
- 非敏感 Worker Variables；
- Custom Domain 或 Worker Route；
- 是否在部署前执行 migration。

目标 JSON 禁止保存 API Token、Shopify Client Secret、Admin Access Token、密码或私钥。这些敏感值写入 Git 忽略的 `deploy/targets/<target>_secret.json`。其中 `CLOUDFLARE_API_TOKEN` 只注入 Wrangler 进程，不上传到 Worker；其他 Secret 在 Worker 创建后通过 Wrangler 标准输入批量上传。CI 环境提供的 `CLOUDFLARE_API_TOKEN` 优先于文件值。

## 使用方式

复制示例配置：

```bash
cp deploy/targets/example.json deploy/targets/customer-a.json
cp deploy/targets/example_secret.json.example deploy/targets/customer-a_secret.json
```

`d1.databaseId` 可以省略。脚本按数据库名称查询目标账号；不存在时自动创建，并把 UUID 回写目标 JSON。可通过 `d1.location` 指定创建位置。

先进行无外部写入的部署验证：

```bash
npm run deploy:target -- customer-a --dry-run
```

确认后部署：

```bash
npm run deploy:target -- customer-a
```

脚本会为 `wrangler d1 migrations apply` 单独设置 `CI=true`，因此自动部署不会停在数据库可用性确认提示；迁移前备份行为保持不变。

如本次不希望执行 migration：

```bash
npm run deploy:target -- customer-a --skip-migrations
```

`--skip-migrations` 只用于本次明确不执行迁移，例如已手工执行同一 SQL 但 D1 migration 历史尚未记录。后续应恢复由部署脚本统一执行迁移。

也可直接指定配置文件路径：

```bash
npm run deploy:target -- deploy/targets/customer-a.json
```

## Secret 配置

Secret 文件使用 JSON 键值结构：

```json
{
  "CLOUDFLARE_API_TOKEN": "...",
  "SHOPIFY_CLIENT_SECRET": "...",
  "SHOPIFY_ADMIN_ACCESS_TOKEN": "..."
}
```

第三项仅在单店 POC Token 模式需要。脚本拒绝空 Secret，并自动把 Secret 文件权限收紧为当前用户可读写。`CLOUDFLARE_API_TOKEN` 会在上传 Worker Secret 前被剔除。该文件已加入 `.gitignore`，不得强制提交。

## 验证与回滚

部署前脚本校验 Account ID、D1 UUID、变量类型，并拒绝疑似 Secret 字段。`--dry-run` 会完成生产构建并让 Wrangler 校验部署产物，但不会执行远端 migration 或发布 Worker。

上线后验证 `/api/health`、管理端 Session Token 鉴权、Storefront 配置读取和 Shopify Webhook。Worker 代码异常时使用 Cloudflare Worker Version 回滚；D1 migration 应按新增 migration 修复，不直接回退或删除生产数据库。
