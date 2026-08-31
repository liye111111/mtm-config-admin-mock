import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyTemplateConfig, templateConfigSchema } from "../src/schemas/template.ts";
import { validateStepStructure, validateOptionSelections } from "../src/domain/template-rules.ts";
import { parseValidateConfiguration } from "../src/schemas/storefront.ts";
import { parseShopifyImages, canonicalizeTemplateImages } from "../src/services/template-media-service.ts";
import { GET, POST } from "../app/api/templates/route.ts";
import { PUT } from "../app/api/templates/[id]/route.ts";
import { POST as publish } from "../app/api/templates/[id]/publish/route.ts";
import { POST as resolve } from "../app/api/shopify/files/resolve/route.ts";
import { findPublishedTemplateForProduct, findTemplateVersion } from "../src/repositories/template-repository.ts";
import { env, faults, sqlite } from "./worker-env.mjs";

const fileId = "gid://shopify/MediaImage/123";
const image = { fileId, url: "https://cdn.shopify.com/test.jpg", alt: "领型", width: 400, height: 400 };
const option = (code) => ({ id: code, code, name: code, enabled: true, defaultSelected: false, sortOrder: 0, applicableCategories: ["jacket"], affectsPrice: false });
function config() {
  return { ...createEmptyTemplateConfig(), steps: [{ id: "detail", code: "detail", title: "西服细节", type: "options", required: true, enabled: true, sortOrder: 0,
    optionGroups: ["lapel", "pocket", "lining"].map((code, index) => ({ id: code, code, title: code, displayStyle: "text", required: true, enabled: true, sortOrder: index, options: [option(`${code}_one`), option(`${code}_two`)] })),
  }] };
}
const request = (path, method = "GET", body) => new Request(`http://localhost${path}`, { method, headers: { "X-MTM-Mock-Shopify": "1", "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const context = (id) => ({ params: Promise.resolve({ id }) });
const responseFor = (ids, patch = {}) => ({ data: { nodes: ids.map((id) => ({ __typename: "MediaImage", id, fileStatus: "READY", alt: "领型", image: { url: image.url, altText: "", width: 400, height: 400 }, ...patch })) } });

test("v3 三层配置往返、三种样式与折扣仅展示", () => {
  const data = config();
  data.steps[0].optionGroups.forEach((group, index) => { group.displayStyle = ["image_text", "text", "icon_text"][index]; group.options.forEach((item) => { item.displayImage = image; item.badge = { text: "10% Sale", type: "discount" }; }); });
  const parsed = templateConfigSchema.parse(JSON.parse(JSON.stringify(data)));
  validateStepStructure(parsed, true);
  assert.equal(parsed.steps[0].optionGroups.length, 3);
  assert.equal(parsed.steps[0].optionGroups[0].options[0].affectsPrice, false);
  assert.equal(templateConfigSchema.safeParse({ ...data, schemaVersion: 2 }).success, false);
  data.steps[0].options = [];
  assert.equal(templateConfigSchema.safeParse(data).success, false);
});
test("展示素材允许存草稿，但图文／图标组选项发布必填", () => {
  for (const style of ["image_text", "icon_text"]) {
    const data = config(); data.steps[0].optionGroups[0].displayStyle = style;
    validateStepStructure(data);
    assert.throws(() => validateStepStructure(data, true), /缺少展示素材/);
    data.steps[0].optionGroups[0].enabled = false;
    validateStepStructure(data, true);
  }
});
test("组编码跨步骤唯一、默认选项互斥、特殊步骤不能混入组", () => {
  const data = config(); data.steps.push({ ...structuredClone(data.steps[0]), id: "next", code: "next" });
  assert.throws(() => validateStepStructure(data), /选项组编码重复/);
  data.steps.pop(); data.steps[0].optionGroups[0].options.forEach((item) => { item.defaultSelected = true; });
  assert.throws(() => validateStepStructure(data), /默认选项/);
  data.steps[0].optionGroups[0].options.forEach((item) => { item.defaultSelected = false; }); data.steps[0].type = "review";
  assert.throws(() => validateStepStructure(data), /不能包含选项组/);
  const reserved = config(); reserved.steps[0].optionGroups[0].code = "measurements";
  assert.throws(() => validateStepStructure(reserved), /保留字/);
});
test("同页各组独立校验，拒绝无效／停用选项、旧键及多选", () => {
  const data = config(), choices = { lapel: "lapel_one", pocket: "pocket_two", lining: "lining_one" };
  assert.equal(validateOptionSelections(data, choices).length, 3);
  assert.throws(() => validateOptionSelections(data, { ...choices, pocket: "" }), /请选择pocket/);
  assert.throws(() => validateOptionSelections(data, { ...choices, lapel: ["lapel_one"] }), /有效选项/);
  assert.throws(() => validateOptionSelections(data, { ...choices, detail: "lapel_one" }), /无效选项组/);
  data.steps[0].optionGroups[0].options[0].enabled = false;
  assert.throws(() => validateOptionSelections(data, choices), /无效选项/);
  data.steps[0].optionGroups[0].options[1].enabled = false;
  assert.equal(validateOptionSelections(data, { pocket: "pocket_two", lining: "lining_one" }).length, 2);
  assert.throws(() => parseValidateConfiguration({ productId: "1", variantId: "2", selections: choices }), /Schema v3/);
});
test("Shopify 响应验证：成功、跨店／不存在、非图片、处理中、权限及损坏响应", () => {
  assert.deepEqual(parseShopifyImages(responseFor([fileId]), [fileId]), [image]);
  assert.throws(() => parseShopifyImages({ data: { nodes: [null] } }, [fileId]), /不存在或不属于/);
  assert.throws(() => parseShopifyImages(responseFor([fileId], { __typename: "Video" }), [fileId]), /图片文件/);
  assert.throws(() => parseShopifyImages(responseFor([fileId], { fileStatus: "PROCESSING" }), [fileId]), /尚未就绪/);
  assert.throws(() => parseShopifyImages({ errors: [{ message: "denied", extensions: { code: "ACCESS_DENIED" } }] }, [fileId]), /权限/);
  assert.throws(() => parseShopifyImages({ data: { nodes: [] } }, [fileId]), /不完整/);
});
test("模板 API：鉴权、新建、保存、发布、v3 列表与存储失败", async () => {
  assert.equal((await GET(new Request("http://localhost/api/templates"))).status, 401);
  assert.equal((await POST(request("/api/templates", "POST", { config: { ...config(), schemaVersion: 2 } }))).status, 400);
  const created = await POST(request("/api/templates", "POST", { name: "三级模型验证", config: config() }));
  assert.equal(created.status, 201);
  const { data } = await created.json(); const ctx = context(data.id);
  const draft = { code: data.code, name: data.name, category: data.category, config: config() };
  draft.config.steps[0].optionGroups[0].displayStyle = "image_text";
  assert.equal((await PUT(request(`/api/templates/${data.id}`, "PUT", draft), ctx)).status, 200);
  const rejected = await publish(request(`/api/templates/${data.id}/publish`, "POST", draft), ctx);
  assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /缺少展示素材/);
  draft.config.steps[0].optionGroups[0].displayStyle = "text";
  const published = await publish(request(`/api/templates/${data.id}/publish`, "POST", draft), ctx);
  assert.equal(published.status, 200);
  const publishedData = (await published.json()).data;
  assert.equal(publishedData.config.schemaVersion, 3);
  assert.ok(await findTemplateVersion(data.id, publishedData.version));
  assert.equal((await PUT(request("/api/templates/missing", "PUT", draft), context("missing"))).status, 404);
  faults.writes = true;
  try {
    const failedSave = await PUT(request(`/api/templates/${data.id}`, "PUT", draft), ctx);
    assert.equal(failedSave.status, 500);
    assert.equal((await failedSave.json()).error, "服务暂时不可用，请稍后重试");
    assert.equal((await publish(request(`/api/templates/${data.id}/publish`, "POST", draft), ctx)).status, 500);
  } finally { faults.writes = false; }
  assert.equal(await findTemplateVersion(data.id, publishedData.version + 1), null);
  // 保留原始记录只用于验证 v2 不进入新列表／Storefront，测试不连接实际数据库。
  sqlite.prepare("UPDATE templates SET schema_version=2 WHERE id=?").run(data.id);
  sqlite.prepare("UPDATE template_versions SET schema_version=2 WHERE template_id=?").run(data.id);
  const list = (await (await GET(request("/api/templates"))).json()).data;
  assert.equal(list.some((item) => item.id === data.id), false);
  assert.equal(await findTemplateVersion(data.id, publishedData.version), null);
  sqlite.prepare("UPDATE product_bindings SET template_id=?,published_version=? WHERE id='binding-poc'").run(data.id, publishedData.version);
  assert.equal(await findPublishedTemplateForProduct("local-dev.myshopify.com", "10296845205799"), null);
});
test("素材 API 拒绝缺权限、无效 ID、损坏 JSON；本地无原生环境有明确提示", async () => {
  assert.equal((await resolve(new Request("http://localhost/api/shopify/files/resolve", { method: "POST" }))).status, 401);
  assert.equal((await resolve(request("/api/shopify/files/resolve", "POST", { ids: ["bad"] }))).status, 400);
  assert.equal((await resolve(new Request("http://localhost/api/shopify/files/resolve", { method: "POST", headers: { "X-MTM-Mock-Shopify": "1" }, body: "{" }))).status, 400);
  assert.equal((await resolve(request("/api/shopify/files/resolve", "POST", { ids: [fileId] }))).status, 503);
});
test("保存素材使用服务端查询结果，覆盖伪造 URL（全部网络使用测试桩）", async () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256" })}.${encode({ aud: env.SHOPIFY_CLIENT_ID, dest: `https://${env.SHOPIFY_STORE}`, exp: Math.floor(Date.now() / 1000) + 60 })}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SHOPIFY_CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned))).toString("base64url");
  const req = new Request("http://localhost/api/templates", { headers: { Authorization: `Bearer ${unsigned}.${signature}` } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).hostname, env.SHOPIFY_STORE);
    return Response.json(responseFor(JSON.parse(init.body).variables.ids));
  };
  try {
    const data = config(); data.steps[0].defaultPreviewImage = { ...image, url: "https://invalid.example/forged.jpg" };
    const canonical = await canonicalizeTemplateImages(req, env.SHOPIFY_STORE, data);
    assert.equal(canonical.steps[0].defaultPreviewImage.url, image.url);
  } finally { globalThis.fetch = originalFetch; }
});
