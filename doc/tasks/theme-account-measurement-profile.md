# 店铺主题账号量体资料页

## 目标与边界

新版客户账户菜单链接到 Online Store 的 `/pages/measurement-profile`。页面通过 App Proxy 管理当前登录客户的一套量体资料，不使用 Customer Account UI Extension，不实现多档案或匿名资料管理。

## API

```text
GET    /api/storefront/account-measurement-fields
GET    /api/storefront/account-measurement-profile
PUT    /api/storefront/account-measurement-profile
DELETE /api/storefront/account-measurement-profile
```

所有接口验证 App Proxy 签名并要求 `logged_in_customer_id`。请求不能指定店铺、客户、访客或资料 ID。资料以量体属性的标准单位保存；`unit` 只记录客户偏好的公制或英制展示方式。

账号页字段来自当前店铺启用的 `measurement_attributes`。该元数据没有全局上下限，因此账号页验证字段白名单、正数和属性精度；具体商品的必填、范围和步长仍由已有商品定制器接口按已发布模板验证。

## 数据兼容

- 继续使用 `measurement_profiles` 及 `(shop_id, customer_id)` 唯一约束。
- 账号页和商品定制器读写同一条登录客户资料。
- 删除当前资料不修改定制实例或订单尺寸快照。
- 现有匿名资料和迁移接口保持不变。

## Theme 对接

主题页面通过 `/apps/mtm-config/storefront/account-measurement-*` 请求接口。字段由服务端动态返回；切换 IN 时，长度显示为 IN、重量显示为 LB，保存前换算回字段标准单位。Theme Editor 无客户身份时只显示预览字段，不写真实数据。

## 验证

```bash
npm run lint
npm run test:unit
npm test
```

真实店铺还需验证：新版客户账户登录后进入 Online Store 页面时 App Proxy 是否收到 `logged_in_customer_id`、保存后商品定制器能否回填、账户菜单入口及移动端布局。

## 上线与回滚

先部署 Worker，再发布 Theme。确认 `/pages/measurement-profile` 使用专用模板后再开放客户账户菜单入口。回滚时先移除菜单入口，再回滚 Theme；新 API 和已有资料表可以保留，禁止删除客户资料或历史快照。
