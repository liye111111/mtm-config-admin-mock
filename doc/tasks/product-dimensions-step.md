# 成品尺寸步骤任务

## 背景与目标

窗帘宽高属于商品成品尺寸，不应作为人体量体资料保存或复用。本任务新增 `dimensions` 步骤及独立 `dimensionBlocks`，与现有 `measurements`、`measurementBlocks` 分离。

## 数据与兼容性

- `dimensions`：成品尺寸步骤，提交到 `selections.dimensions`。
- `dimensionBlocks`：成品尺寸字段、单位及范围。
- `measurements`：人体量体步骤，继续提交到 `selections.measurements` 并可保存客户量体档案。

`dimensionBlocks` 在 Schema v2 中带空数组默认值，旧模板不需要迁移。完整选择快照会保存成品尺寸；人体量体快照和客户量体档案不会包含成品尺寸。

## Storefront 行为

主题根据 `dimensions` 动态生成成品尺寸表单，独立校验并在确认页显示。它不会触发量体资料读取、保存或清除。窗帘模板已迁移并发布为 v3。

## 验证与上线

已执行 Worker lint、生产构建及 JavaScript 语法检查。Worker 与在线 Shopify 主题分别部署。回滚时应先把使用 `dimensions` 的模板回滚到旧发布版本，再回滚 Worker 和主题文件。
