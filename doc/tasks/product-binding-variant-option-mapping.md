# 商品绑定 Variant Option 映射

## 背景与目标

Shopify 商品可以自由命名规格，例如“材质”“面料”或 `Fabric`。定制系统不得依赖中文规格名判断 SKU。模板只定义稳定业务角色，具体 Shopify Option 在商品绑定记录上完成映射。

## 数据关系

`product_bindings.variant_option_mappings_json` 保存按角色编码组织的映射。当前材质步骤使用稳定角色 `material`：

```json
{
  "material": {
    "shopifyOptionId": "gid://shopify/ProductOption/123",
    "name": "面料",
    "position": 1
  }
}
```

`shopifyOptionId` 是校验身份的权威字段；`name` 和 `position` 是同步快照，分别用于诊断、Storefront 展示和 Theme 从 Variant Option 数组取值。同一模板绑定不同商品时可以映射到不同名称。

## 行为与兼容性

- 启用了 `material` 步骤的模板必须存在 `material` 映射。
- 商品只有一个 Shopify Option 且未显式选择时，绑定服务自动建立映射。
- 商品包含多个 Option 时，运营人员必须在商品绑定表单明确选择。
- 没有 `material` 步骤的模板不要求材质映射，Variant ID 仍是交易、库存和价格的权威标识。
- 老绑定的映射字段默认 `{}`；单 Option 商品继续自动兼容，多 Option 商品需要重新编辑绑定。
- Shopify Option 改名不会破坏身份匹配；重新保存或同步绑定时刷新名称与位置快照。Option 被删除时返回稳定冲突错误并要求重新同步。

## 涉及范围

- D1/Drizzle：商品绑定新增 JSON 字段及迁移。
- Admin：商品选择结果读取 Options，材质步骤显示 Option 映射下拉框。
- Shopify 集成：预览及 Variant 校验按 ProductOption GID 解析，不比较中文名称。
- Storefront：配置返回 `variantOptionMappings`，订单属性仅在存在材质值时写入。
- Theme：输出完整 Variant Options，并按映射位置读取展示值。

## 验证

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run test:unit
npm run build
node --test ../doc/tests/mtm-theme-v3.test.mjs
```

人工验证路径：分别绑定规格名为“材质”“面料”和 `Fabric` 的单 Option 商品；对多 Option 商品显式选择映射；打开商品页完成定制、校验及加入购物车。

## 上线与回滚

先执行 D1 migration，再部署 Worker，最后发布 Theme 文件。回滚应用代码时保留新增字段和数据；该字段有默认值且不会影响旧代码读取。不要删除历史商品绑定或定制实例。
