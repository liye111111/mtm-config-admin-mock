import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteAccountMeasurementProfile,
  getAccountMeasurementFields,
  getAccountMeasurementProfile,
  saveAccountMeasurementProfile,
} from "../src/services/measurement-profile-service.ts";
import * as fieldsRoute from "../app/api/storefront/account-measurement-fields/route.ts";
import * as profileRoute from "../app/api/storefront/account-measurement-profile/route.ts";

const identity = { shopId: "account-profile-test.myshopify.com", customerId: "10001" };

test("账号量体字段只返回启用的店铺级元数据", async () => {
  const result = await getAccountMeasurementFields(identity);
  assert.equal(result.schemaVersion, 1);
  assert.ok(result.fields.some((field) => field.code === "height" && field.canonicalUnit === "CM"));
  assert.ok(result.fields.some((field) => field.code === "weight" && field.canonicalUnit === "KG"));
});

test("账号只能保存一套资料，重复保存覆盖且删除幂等", async () => {
  assert.deepEqual(await getAccountMeasurementProfile(identity), { exists: false, ownerType: "customer", profile: null });
  await saveAccountMeasurementProfile(identity, { unit: "CM", schemaVersion: 1, measurements: { height: 175, weight: 68 } });
  await saveAccountMeasurementProfile(identity, { unit: "CM", schemaVersion: 1, measurements: { height: 176.5 } });
  const saved = await getAccountMeasurementProfile(identity);
  assert.equal(saved.exists, true);
  assert.deepEqual(saved.profile.measurements, { height: 176.5 });
  await deleteAccountMeasurementProfile(identity);
  await deleteAccountMeasurementProfile(identity);
  assert.equal((await getAccountMeasurementProfile(identity)).exists, false);
});

test("账号接口拒绝匿名身份、未知字段、非正数和超精度", async () => {
  await assert.rejects(getAccountMeasurementFields({ ...identity, customerId: null }), /请先登录/);
  await assert.rejects(saveAccountMeasurementProfile(identity, { unit: "CM", schemaVersion: 1, measurements: { unknown: 1 } }), /未知或已停用/);
  await assert.rejects(saveAccountMeasurementProfile(identity, { unit: "CM", schemaVersion: 1, measurements: { height: 0 } }), /大于 0/);
  await assert.rejects(saveAccountMeasurementProfile(identity, { unit: "CM", schemaVersion: 1, measurements: { height: 175.55 } }), /最多保留 1 位小数/);
});

function request(path, options = {}, customerId = "route-customer") {
  return new Request(`http://localhost/api/storefront/${path}`, {
    ...options,
    headers: {
      "X-MTM-Mock-Shopify": "1",
      "X-MTM-Mock-Shop": "route-test.myshopify.com",
      ...(customerId ? { "X-MTM-Mock-Customer": customerId } : {}),
      ...(options.headers || {}),
    },
  });
}

test("账号量体 HTTP 路由完成登录查询、保存、清除及错误边界", async () => {
  const fieldsResponse = await fieldsRoute.GET(request("account-measurement-fields"));
  assert.equal(fieldsResponse.status, 200);
  assert.ok((await fieldsResponse.json()).fields.length > 0);

  const anonymousResponse = await profileRoute.GET(request("account-measurement-profile", {}, null));
  assert.equal(anonymousResponse.status, 401);

  const invalidJsonResponse = await profileRoute.PUT(request("account-measurement-profile", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: "{",
  }));
  assert.equal(invalidJsonResponse.status, 400);

  const saveResponse = await profileRoute.PUT(request("account-measurement-profile", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unit: "CM", schemaVersion: 1, measurements: { height: 178 } }),
  }));
  assert.equal(saveResponse.status, 200);
  assert.deepEqual((await saveResponse.json()).profile.measurements, { height: 178 });

  const oversizedResponse = await profileRoute.PUT(request("account-measurement-profile", {
    method: "PUT", headers: { "Content-Type": "application/json", "Content-Length": "20000" }, body: "{}",
  }));
  assert.equal(oversizedResponse.status, 413);

  const deleteResponse = await profileRoute.DELETE(request("account-measurement-profile", { method: "DELETE" }));
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { deleted: true });
});
