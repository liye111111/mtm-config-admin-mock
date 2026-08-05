# 模板品类 CRUD 任务

## 背景与目标

原模板品类由 TypeScript/Zod 固定枚举维护，新增品类需要发布代码。本任务将品类迁移为 D1 管理数据，提供管理端和 API 的增删改查；当品类已有模板引用时禁止删除。

## 数据与接口

新增 `template_categories` 表，字段包括稳定编码、名称、排序和审计时间。初始化逻辑会幂等写入套装、西服、西裤、衬衫、马甲和窗帘六个现有品类，不修改 `templates.category`，因此已有模板无需转换。

- `GET /api/template-categories`：返回品类及模板引用数。
- `POST /api/template-categories`：创建品类。
- `PUT /api/template-categories/:id`：更新名称和排序；稳定编码不可修改。
- `DELETE /api/template-categories/:id`：无模板引用时删除；存在引用时返回 HTTP 409。

模板创建、保存和发布会校验主品类以及配置中引用的品类均存在。管理端从 API 加载品类，不再依赖固定枚举。

## 验证与上线

执行 `npm run lint`、`npm test`。部署后验证创建、查询、更新和删除空品类，并验证删除已有模板的品类返回 409。回滚应用前不得删除仍被模板引用的品类记录；表结构可保留，不影响旧 Worker 读取模板。

管理写接口仍是 POC 能力，生产化前需要补齐鉴权、权限和审计。
