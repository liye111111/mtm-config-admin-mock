# 窗帘定制模板任务

## 背景与目标

在现有 Schema v2 模板体系中增加 `curtain`（窗帘）品类，并在远程 D1 中创建一份窗帘定制模板。模板覆盖窗帘款式、开合方式、安装方式和成品尺寸，不绑定 Shopify 商品。

## 涉及范围

- `src/domain/common.ts`：增加窗帘品类类型及中文标签。
- `src/schemas/template.ts`：允许 API、模板配置选项和量体区块使用 `curtain`。
- D1 `templates`、`template_versions`：通过已有模板 API 创建并发布配置。

数据库表结构没有变化，`category` 继续使用现有文本字段，因此不需要 Drizzle migration。

## API 与兼容性

模板创建、保存和发布 API 新增接受 `category: "curtain"`。已有品类及 Schema v2 数据保持兼容。Storefront 仍只对已绑定商品返回配置，本任务不创建商品绑定。

## 实现与验证

1. 扩展共享品类类型、标签和 Zod 枚举。
2. 执行 `npm run lint` 与 `npm test`。
3. 部署 Worker。
4. 通过 `POST /api/templates` 创建模板，再通过发布接口生成不可变版本。
5. 通过模板列表和版本 API 校验模板、品类、状态及配置内容。

## 上线与回滚

应用变更只扩大输入白名单。若需回滚，应先删除或迁移 D1 中所有 `curtain` 模板，再回滚 Worker；否则旧版本会因无法解析窗帘配置而使模板列表请求失败。

管理写接口目前仍属于 POC 能力，上线前需要可靠的鉴权、权限控制和审计。
