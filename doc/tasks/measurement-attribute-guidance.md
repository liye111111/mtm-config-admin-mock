# 量体属性引导图与滑动录入

## 目标

将量体字段的图片、说明、标准单位、上下限和步长统一收口到量体属性管理。定制模板只引用属性并配置必填或选填。

## 实现

- `measurement_attributes` 新增 `min_value`、`max_value`、`step_value` 和 `image_json`。
- 管理端复用 Shopify Admin 原生文件选择器；服务端保存前重新查询图片，不信任前端 URL。
- Storefront 配置从属性解析范围、步长、图片和说明；旧模板中的范围字段仅为解析兼容，不再使用或展示。
- 模板字段不再支持单独停用：加入模板即参与展示，复选框只表示“是否必填”。旧配置中 `enabled: false` 的字段自动转为选填字段。
- 商品定制器上方固定引导区，跟随当前字段切换；下方使用滑动条与数值框双向同步，选填项默认折叠。
- 账号量体页同步显示引导图，并共用属性范围校验。

## 部署与回滚

先执行 `0011_measurement_attribute_guidance.sql`，再部署 Worker 和主题。上线后在量体属性页核对每个字段的范围、步长与图片。回滚代码时保留新增列，不删除历史量体资料。

## 验证

- `npm run lint`
- `npm test`
- `npm run test:unit`
- 主题 MTM v3 回归测试与真实 Shopify Admin 文件选择器联调。
