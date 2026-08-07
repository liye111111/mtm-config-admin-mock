# Shopify 商品定制标记

## 背景与目标

商品详情页原先必须等待 Storefront 配置接口返回后才知道是否显示定制按钮，导致按钮晚于其他购买控件出现。商品绑定保存后同步写入 Shopify Product Metafield，让 Theme Liquid 在服务端渲染阶段即可判断商品是否启用定制。

## 数据约定

- Owner：Shopify Product
- Namespace：`mtm`
- Key：`customization`
- Type：`json`

启用示例：

```json
{"enabled":true,"templateCode":"mens_suit_v1","templateVersion":5}
```

停用或解绑：

```json
{"enabled":false}
```

Metafield 是 Shopify 展示侧投影；D1 `product_bindings` 仍是 Storefront API 校验和下单的权威数据源。

## 实现范围

- 新增、编辑、重新同步商品绑定时写入 Metafield；
- 停用或解绑时写入 `enabled:false`；
- Theme Liquid 仅在 `product.metafields.mtm.customization.value.enabled == true` 时输出定制器；
- 本地 Mock Shopify 模式跳过外部写入；
- Shopify 写入失败时绑定操作失败，避免 D1 成功但前台标记缺失。

## 验证

```bash
npm run lint
npm test
shopify theme check
```

人工验证：对已有绑定执行“重新同步”，在 Shopify 商品 Metafield 中确认标记；打开商品详情确认按钮随 HTML 同步出现；停用或解绑后确认按钮消失；提交定制时仍由 Storefront API 校验 D1 绑定。

## 上线与回滚

先部署 Admin/API，再对现有绑定逐一执行“重新同步”，最后发布 Theme。回滚 Theme 判断即可恢复原先接口探测行为；保留 Metafield 不影响 Storefront API 权威校验。
