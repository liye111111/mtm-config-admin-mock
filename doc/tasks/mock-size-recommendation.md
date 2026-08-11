# Mock 尺码推荐

## 目标

先打通“已有量体资料 → 后端推荐 → Theme 自动选码 → 推荐提示”完整链路。当前接口不执行真实尺码算法，只从当前颜色下的可售尺码中随机返回一个结果。

## API

`POST /api/storefront/size-recommendation`

请求包含 `productId`、`availableSizes` 和 `measurements`。服务端验证 App Proxy、商品已绑定已发布模板、候选尺码非空及量体数据非空，然后返回 `mock:true`、推荐尺码和版本。

## Theme 行为

- 仅在成功读取已保存量体资料时调用；
- 候选尺码只取当前颜色下可售 Variant；
- 推荐成功后同时选中商品页原生 Variant Picker 和定制器内的尺码，并在对应按钮显示“推荐尺码”；
- 用户可以改选，推荐标记继续保留；
- 推荐失败不影响正常定制和下单。

## 后续替换

正式阶段保持接口响应结构，使用版本化尺码规则和量体匹配算法替换随机逻辑。服务端应自行读取权威尺码规则，不信任客户端候选规则；完整量体数据不得写入日志。

## 验证

```bash
npm run lint
npm test
shopify theme check
```
