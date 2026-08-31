# 模板 Schema v3 后台与 API

日期：2026-08-31。状态：后台本地实现，未部署，Theme 尚未适配 v3。

## 模型与管理流程

统一层级为 `steps → optionGroups → options`。步骤代表消费者一页；每个组单选、独立必填，组在同一模板内使用唯一编码。后台支持步骤、组、选项增删与上下移动，以及组跨步骤移动；按稳定 ID 更新，移动不会改变组和选项编码。

- 步骤：`defaultPreviewImage` 可选，作为默认大图。
- 组：`displayStyle` 为 `image_text`、`text`、`icon_text`，对应图文、文本、图标＋文本。
- 选项：`displayImage` 为缩略图／图标，`previewImage` 为独立预览大图；`badge` 为可选的 `{ "type": "discount", "text": "10% Sale" }`。标签只展示，`affectsPrice` 固定为 `false`。
- 素材引用：`{ fileId, url, alt, width?, height? }`。通过原生文件选择器创建，保存与发布时服务端重新查询当前店铺并覆盖客户端 URL、描述和尺寸。
- 图文／图标组中启用的选项，在组及步骤均启用时，发布必须有展示素材；草稿允许缺图。停用整个组或步骤不会阻止发布。
- 后台试选预览展示三种卡片和标签，点击选项切换大图；默认大图缺失可隐藏。试选结果不作为模板选择数据保存。
- 普通组选项不再支持 v2 的色卡、下拉、普通文本输入展示类型；刺绣保留独立文字输入规则及字典。
- 不增加 A／C／E 标记，不录入开衩，不建设实际折扣计算。

## 原生素材选择器

客户端调用 `shopify.intents.invoke('pick:shopify/File', { data: { mediaTypes: ['MediaImage'], multiSelect: false, selectedFiles: [...] } })`，完成后将所选 ID 发给以下接口。独立本地页面显示进入 Shopify Admin 的提示，不提供自建素材库或伪造的生产素材。

`POST /api/shopify/files/resolve`

```json
{ "ids": ["gid://shopify/MediaImage/123"] }
```

要求现有 Shopify Session Token 鉴权，单次 1–50 个图片 ID。返回 `{ "success": true, "data": [{ "fileId": "...", "url": "...", "alt": "...", "width": 400, "height": 400 }] }`。文件需属于当前店铺，为 `MediaImage`，且已处理完成。

| 状态 | 含义 |
|---|---|
| 400 | JSON、ID 或数量无效 |
| 401 | 缺少或无效管理会话 |
| 403 | 文件权限不足或店铺身份不匹配 |
| 404 | 文件不存在或当前店铺不可见 |
| 422 | 非图片、未就绪或处理失败 |
| 502 | Shopify 网络、上游响应异常 |
| 503 | 本地 Mock 模式不提供原生素材 |

单个模板最多关联 250 张不同图片，保存时以 50 个为一批查询。未声明新生产依赖或新环境变量，复用现有 Shopify 鉴权。聚合工作区应用配置新增 `read_files`，但尚未部署或重新授权。删除配置内的关联不会调用 Shopify 文件删除接口。

## 模板与 Storefront 契约

创建、保存、发布的路径不变。`config.schemaVersion` 必须为 `3`；步骤必须包含 `optionGroups`，不接受旧的直接 `options`、`displayType` 等字段。重复组编码、系统保留编码、重复选项编码和多个启用默认值均拒绝。

Storefront 配置响应保持 `enabled + configuration` 外层结构，内部为 v3。校验及实例创建请求新增必传 `schemaVersion: 3`，选择键改为组编码：

```json
{
  "schemaVersion": 3,
  "productId": "123",
  "variantId": "456",
  "configVersion": 2,
  "selections": {
    "lapel": "notch",
    "pocket": "flap",
    "components": {
      "jacket": { "lapel": "notch" }
    }
  }
}
```

以上仅示意单品组与套装组件作用域，不应为单品提交不相关组件。实际请求需匹配商品所绑定模板。实例创建仍额外需要 `idempotencyKey`。`configVersion` 是模板发布次数，不是 Schema 版本。

服务端按所有启用、非空组校验：必填缺失、禁用选项、数组多选、未知组键等返回错误；空组不参与必填校验。摘要来自服务端组名称与选项名称，不信任客户端标签或价格。历史量体资料的 `schemaVersion` 是另一数据协议，不随模板升级修改。

## 旧配置与上线边界

只实现 v3，不转换或服务旧 v2。模板列表、可绑定发布版本和 Storefront 查询过滤旧 Schema；旧绑定不返回旧配置。不会在请求初始化中自动清理旧数据库行，也不会改写订单快照或量体资料。

上线前必须完成：备份、重建并发布 v3 模板、处理旧商品绑定、升级 Theme 以支持新模型与请求版本、真实 Shopify 嵌入环境联调。不应单独把这次后台改造部署给仍使用 v2 Theme 的店铺。物理清理旧模板数据是单独的受控操作，不是本次开发执行内容。

## 验证

执行 `npm run test:unit`（内存 SQLite、模拟 Shopify 响应，不读取真实凭据或数据库）、`npm run lint`、`npm test`（生产构建）。原生选择器的真实弹窗、员工权限、取消与回填仍需在 Shopify Admin 联调；本地提示与服务端响应验证不能代替此项验收。

独立 `npx tsc --noEmit --incremental false` 当前存在原始提交已有的 4 处错误：Webhook 的 BufferSource 类型一处、尺码推荐联合类型缩窄三处。已对照未修改的 HEAD 验证错误一致，本任务未新增类型错误，也未顺带修改上述模块。
