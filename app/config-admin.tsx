"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_EMBROIDERY_CONFIG, garmentCategoryLabels, type CustomizationOption, type CustomizationStep, type GarmentCategory, type GarmentComponentDefinition, type MeasurementBlock, type MeasurementFieldDefinition, type TemplateType, type TextInputConfig } from "@/src/domain";
import { apiJson, isAuthorizationError, jsonRequest } from "./admin/api";
import { AdminShell, type AdminView } from "./admin/app-shell";
import { MeasurementAttributes } from "./admin/measurement-attributes";
import type { CustomerMeasurementProfileDetail, MeasurementAttributeDraft, MeasurementAttributeView, MeasurementProfileAdminView, MeasurementProfileFilter, MeasurementProfilePage, ProductBindingView, ShopifyProductSelection, TemplateCategoryView, TemplateTab, TemplateVersionView, TemplateView } from "./admin/types";
import { isShopifyEmbedded, selectShopifyProducts } from "./admin/shopify";

const stepTypes: Array<[CustomizationStep["type"], string]> = [["options", "定制选项"], ["embroidery", "刺绣定制"], ["components", "组合/套装"], ["measurements", "量体尺寸"], ["review", "配置确认"]];
const displayTypes = [["image_card", "图片卡片"], ["color_swatch", "色卡"], ["radio", "单选"], ["select", "下拉选择"], ["text_input", "文本输入"]] as const;

function clone<T>(value: T): T { return structuredClone(value); }
function sortByOrder<T extends { sortOrder: number }>(items: T[]) { return items; }
function moveByOrder<T extends { sortOrder: number }>(items: T[], from: number, to: number) { const [moved] = items.splice(from, 1); items.splice(to, 0, moved); items.forEach((item, index) => { item.sortOrder = index; }); }

export function ConfigAdmin() {
  const [view, setView] = useState<AdminView>("templates");
  const [items, setItems] = useState<TemplateView[]>([]);
  const [draft, setDraft] = useState<TemplateView | null>(null);
  const [selected, setSelected] = useState("");
  const [bindings, setBindings] = useState<ProductBindingView[]>([]);
  const [versions, setVersions] = useState<TemplateVersionView[]>([]);
  const [bindingVersions, setBindingVersions] = useState<TemplateVersionView[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TemplateTab>("base");
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingBinding, setEditingBinding] = useState<ProductBindingView | null>(null);
  const [bindingProducts, setBindingProducts] = useState<ShopifyProductSelection[]>([]);
  const [measurementProfileResult, setMeasurementProfileResult] = useState<MeasurementProfilePage>({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1, stats: { total: 0, customer: 0, guest: 0, activeGuest: 0 } });
  const [measurementProfileFilter, setMeasurementProfileFilter] = useState<MeasurementProfileFilter>("all");
  const [customerProfileDraft, setCustomerProfileDraft] = useState<CustomerProfileDraft | null>(null);
  const [categories, setCategories] = useState<TemplateCategoryView[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<{id:string;code:string;name:string;sortOrder:number}|null>(null);
  const [measurementAttributes, setMeasurementAttributes] = useState<MeasurementAttributeView[]>([]);
  const [measurementAttributeDraft, setMeasurementAttributeDraft] = useState<MeasurementAttributeDraft | null>(null);

  const filtered = useMemo(() => items.filter((item) => `${item.name}${item.code}${item.categoryLabel}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const published = items.filter((item) => item.status === "published").length;

  async function loadTemplates(preferred?: string) {
    const payload = await apiJson<TemplateView[]>("/api/templates");
    const list = payload.data ?? [];
    setItems(list);
    const id = preferred || selected || list[0]?.id || "";
    setSelected(id);
    setDraft(clone(list.find((item) => item.id === id) ?? list[0] ?? null));
  }

  async function loadBindings() { const payload = await apiJson<ProductBindingView[]>("/api/products"); setBindings(payload.data ?? []); }
  async function loadCategories() { const payload=await apiJson<TemplateCategoryView[]>("/api/template-categories"); setCategories(payload.data ?? []); }
  async function loadMeasurementAttributes() { const payload = await apiJson<MeasurementAttributeView[]>("/api/measurement-attributes"); setMeasurementAttributes(payload.data ?? []); }
  async function loadMeasurementProfiles(filter = measurementProfileFilter, page = measurementProfileResult.page) {
    const query = new URLSearchParams({ filter, page: String(page), pageSize: String(measurementProfileResult.pageSize) });
    const payload = await apiJson<MeasurementProfilePage>(`/api/measurement-profiles?${query}`);
    if (payload.data) setMeasurementProfileResult(payload.data);
  }
  async function loadVersions(templateId = selected) { if (!templateId) return setVersions([]); const payload = await apiJson<TemplateVersionView[]>(`/api/templates/${templateId}/versions`); setVersions(payload.data ?? []); }
  async function loadBindingVersions(templateId: string) { if (!templateId) return setBindingVersions([]); const payload = await apiJson<TemplateVersionView[]>(`/api/templates/${templateId}/versions`); setBindingVersions(payload.data ?? []); }

  useEffect(() => {
    // Initial API hydration intentionally updates local UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([loadTemplates(), loadBindings(), loadCategories(), loadMeasurementAttributes()])
      .catch((error: unknown) => handleError(error))
      .finally(() => setInitializing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draft || (tab !== "components" && tab !== "steps")) return;
    const cleanups: Array<() => void> = [];
    const bindList = (elements: HTMLElement[], reorder: (from: number, to: number) => void) => {
      let source = -1;
      elements.forEach((element, index) => {
        element.draggable = true;
        element.classList.add("sortable-card");
        const start = (event: DragEvent) => { event.stopPropagation(); source = index; element.classList.add("dragging"); };
        const over = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); };
        const drop = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); if (source >= 0 && source !== index) reorder(source, index); source = -1; };
        const end = () => { source = -1; element.classList.remove("dragging"); };
        element.addEventListener("dragstart", start); element.addEventListener("dragover", over); element.addEventListener("drop", drop); element.addEventListener("dragend", end);
        cleanups.push(() => { element.removeEventListener("dragstart", start); element.removeEventListener("dragover", over); element.removeEventListener("drop", drop); element.removeEventListener("dragend", end); });
      });
    };
    const topLevel = [...document.querySelectorAll<HTMLElement>(".editor > .steps > .step")];
    bindList(topLevel, (from, to) => setDraft((current) => { if (!current) return current; const next = clone(current); if (tab === "components") moveByOrder(next.config.components, from, to); else moveByOrder(next.config.steps, from, to); return next; }));
    if (tab === "steps") document.querySelectorAll<HTMLElement>(".editor > .steps > .step").forEach((stepElement, stepIndex) => {
      bindList([...stepElement.querySelectorAll<HTMLElement>(".option-card")], (from, to) => setDraft((current) => { if (!current) return current; const next = clone(current); moveByOrder(next.config.steps[stepIndex].options, from, to); return next; }));
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [draft, tab]);

  function handleError(error: unknown) {
    if (isAuthorizationError(error)) {
      setAccessDenied(true);
      setNotice(null);
      return;
    }
    setNotice({ type: "error", text: error instanceof Error ? error.message : "操作失败" });
  }

  async function run(work: () => Promise<void>, success: string) {
    setBusy(true); setNotice(null);
    try { await work(); setNotice({ type: "success", text: success }); }
    catch (error) { handleError(error); }
    finally { setBusy(false); }
  }

  function choose(item: TemplateView) { setSelected(item.id); setDraft(clone(item)); setTab("base"); setVersions([]); setNotice(null); }
  function updateDraft(update: (next: TemplateView) => void) { if (!draft) return; const next = clone(draft); update(next); setDraft(next); }

  async function create(source?: TemplateView) {
    await run(async () => {
      const payload = await apiJson<TemplateView>("/api/templates", jsonRequest("POST", source ? { name: `${source.name}（副本）`, category: source.category, config: source.config } : {}));
      if (!payload.data) throw new Error("创建模板未返回数据");
      await loadTemplates(payload.data.id);
    }, source ? "模板已复制" : "模板已创建");
  }

  async function save(publishTemplate = false) {
    if (!draft) return;
    await run(async () => {
      await apiJson(`/api/templates/${draft.id}${publishTemplate ? "/publish" : ""}`, jsonRequest(publishTemplate ? "POST" : "PUT", draft));
      await loadTemplates(draft.id);
      if (publishTemplate) await loadVersions(draft.id);
    }, publishTemplate ? "模板已发布" : "草稿已保存");
  }

  async function removeTemplate() {
    if (!draft || !confirm(`确认删除“${draft.name}”及其发布版本和商品绑定？`)) return;
    await run(async () => { await apiJson(`/api/templates/${draft.id}`, { method: "DELETE" }); setSelected(""); await Promise.all([loadTemplates(), loadBindings()]); }, "模板已删除");
  }

  function setTemplateType(type: TemplateType) { updateDraft((next) => { next.config.templateType = type; next.category = type === "composite" ? "suit" : next.category === "suit" ? "jacket" : next.category; if (type === "single") next.config.components = []; }); if (type === "single" && tab === "components") setTab("base"); }

  function addComponent() { updateDraft((next) => { const existingCodes = new Set(next.config.components.map((component) => component.code)); let sequence = next.config.components.length + 1; while (existingCodes.has(`component_${sequence}`)) sequence += 1; const sortOrder = next.config.components.reduce((maximum, component) => Math.max(maximum, component.sortOrder), -1) + 1; next.config.components.push({ id: crypto.randomUUID(), code: `component_${sequence}`, name: "新逻辑组件", category: "jacket", childTemplateId: "", customizationEnabled: true, required: true, sortOrder }); }); }
  function updateComponent(index: number, key: keyof GarmentComponentDefinition, value: string | boolean | number) { updateDraft((next) => { (next.config.components[index] as unknown as Record<string, unknown>)[key] = value; }); }
  function removeComponent(index: number) { updateDraft((next) => { next.config.components.splice(index, 1); }); }

  function addStep() { updateDraft((next) => { const index = next.config.steps.length; next.config.steps.push({ id: crypto.randomUUID(), code: `step_${index + 1}`, title: "新定制步骤", type: "options", displayType: "radio", required: true, enabled: true, sortOrder: index, options: [] }); }); }
  function updateStep(index: number, key: keyof CustomizationStep, value: string | boolean | number) {
    updateDraft((next) => {
      const step = next.config.steps[index];
      (step as unknown as Record<string, unknown>)[key] = value;
      if (key === "displayType") {
        if (value === "text_input") {
          step.options = [];
          step.textInput ??= { minLength: 0, maxLength: 20, placeholder: "请输入文字", characterPolicy: "unicode_text" };
        } else delete step.textInput;
      }
      if (key === "type") {
        if (value === "embroidery") {
          step.options = [];
          step.displayType = undefined;
          step.textInput ??= { minLength: 1, maxLength: 20, placeholder: "请输入刺绣文字", characterPolicy: "unicode_text" };
          step.embroidery ??= structuredClone(DEFAULT_EMBROIDERY_CONFIG);
        } else if (value !== "options") {
          delete step.textInput;
          delete step.embroidery;
          step.displayType = undefined;
        } else delete step.embroidery;
      }
      if (key === "type" && value !== "options" && value !== "embroidery") {
        step.displayType = undefined;
      }
    });
  }
  function updateTextInput(index: number, key: keyof TextInputConfig, value: string | number) { updateDraft((next) => { const step = next.config.steps[index]; step.textInput ??= { minLength: 0, maxLength: 20, placeholder: "请输入文字", characterPolicy: "unicode_text" }; (step.textInput as unknown as Record<string, unknown>)[key] = value; }); }
  function removeStep(index: number) { updateDraft((next) => { next.config.steps.splice(index, 1); next.config.steps.forEach((item, order) => { item.sortOrder = order; }); }); }
  function addOption(stepIndex: number) { updateDraft((next) => { const options = next.config.steps[stepIndex].options; const index = options.length; options.push({ id: crypto.randomUUID(), code: `option_${index + 1}`, name: "新选项", sortOrder: index, enabled: true, defaultSelected: false, applicableCategories: [next.category], affectsPrice: false }); }); }
  function updateOption(stepIndex: number, optionIndex: number, key: keyof CustomizationOption, value: string | boolean | number | GarmentCategory[]) { updateDraft((next) => { (next.config.steps[stepIndex].options[optionIndex] as unknown as Record<string, unknown>)[key] = value; }); }
  function removeOption(stepIndex: number, optionIndex: number) { updateDraft((next) => { const options = next.config.steps[stepIndex].options; options.splice(optionIndex, 1); options.forEach((item, order) => { item.sortOrder = order; }); }); }

  function addMeasurementBlock() { updateDraft((next) => { const index = next.config.measurementBlocks.length; next.config.measurementBlocks.push({ id: crypto.randomUUID(), code: `measurement_block_${index + 1}`, name: "新尺寸块", applicableCategories: [next.category], enabled: true, sortOrder: index, fields: [] }); }); }
  function updateMeasurementBlock(index: number, key: keyof MeasurementBlock, value: string | boolean | number | GarmentCategory[]) { updateDraft((next) => { (next.config.measurementBlocks[index] as unknown as Record<string, unknown>)[key] = value; }); }
  function removeMeasurementBlock(index: number) { updateDraft((next) => { next.config.measurementBlocks.splice(index, 1); next.config.measurementBlocks.forEach((item, order) => { item.sortOrder = order; }); }); }
  function addMeasurementField(blockIndex: number) { const attribute = measurementAttributes.find((item) => item.enabled); if (!attribute) return handleError(new Error("请先创建并启用量体属性")); updateDraft((next) => { const fields = next.config.measurementBlocks[blockIndex].fields; const index = fields.length; fields.push({ id: crypto.randomUUID(), attributeId: attribute.id, inputUnit: attribute.canonicalUnit, min: 0, max: attribute.dimension === "weight" ? 200 : 250, step: 10 ** -attribute.precision, required: true, enabled: true, sortOrder: index }); }); }
  function updateMeasurementField(blockIndex: number, fieldIndex: number, key: keyof MeasurementFieldDefinition, value: string | boolean | number) { updateDraft((next) => { (next.config.measurementBlocks[blockIndex].fields[fieldIndex] as unknown as Record<string, unknown>)[key] = value; }); }
  function removeMeasurementField(blockIndex: number, fieldIndex: number) { updateDraft((next) => { const fields = next.config.measurementBlocks[blockIndex].fields; fields.splice(fieldIndex, 1); fields.forEach((item, order) => { item.sortOrder = order; }); }); }

  function newBinding() { const templateId = items.find((item) => item.status === "published")?.id ?? ""; setBindingProducts([]); setEditingBinding({ id: "", shopId: "", shopifyProductGid: "", shopifyProductId: "", productTitle: "", productHandle: "", productStatus: "ACTIVE", productKind: "single", variantCount: 0, templateId, publishedVersion: null, enabled: true, syncStatus: "stale" }); void loadBindingVersions(templateId).catch(handleError); }
  function editBinding(binding: ProductBindingView) { const product = { gid: binding.shopifyProductGid, title: binding.productTitle, handle: binding.productHandle, imageUrl: binding.productImageUrl, imageAlt: binding.productImageAlt, status: binding.productStatus, variantCount: binding.variantCount, onlineStoreUrl: binding.onlineStoreUrl, updatedAt: binding.shopifyUpdatedAt }; setBindingProducts([product]); setEditingBinding({ ...clone(binding), mockProduct: product }); void loadBindingVersions(binding.templateId).catch(handleError); }
  async function pickProduct() { if (!editingBinding) return; const products = await selectShopifyProducts(!editingBinding.id); if (!products) return; setBindingProducts(products); }
  async function saveBinding() {
    if (!editingBinding || !bindingProducts.length) return;
    const productsToSave = editingBinding.id ? bindingProducts.slice(0, 1) : bindingProducts;
    await run(async () => {
      const failures: Array<{ product: ShopifyProductSelection; message: string }> = [];
      for (const product of productsToSave) {
        const input = { ...editingBinding, shopifyProductGid: product.gid, shopifyProductId: product.gid.split("/").at(-1) ?? "", productTitle: product.title, productHandle: product.handle, productImageUrl: product.imageUrl, productImageAlt: product.imageAlt, productStatus: product.status, variantCount: product.variantCount, onlineStoreUrl: product.onlineStoreUrl, mockProduct: product };
        try { await apiJson(editingBinding.id ? `/api/products/${editingBinding.id}` : "/api/products", jsonRequest(editingBinding.id ? "PUT" : "POST", input)); }
        catch (error) {
          if (isAuthorizationError(error)) throw error;
          failures.push({ product, message: error instanceof Error ? error.message : "请求失败" });
        }
      }
      await loadBindings();
      if (failures.length) {
        setBindingProducts(failures.map(({ product }) => product));
        const successCount = productsToSave.length - failures.length;
        throw new Error(`${successCount ? `已成功绑定 ${successCount} 个商品；` : ""}${failures.length} 个商品失败：${failures.map(({ product, message }) => `${product.title}（${message}）`).join("；")}`);
      }
      setEditingBinding(null); setBindingProducts([]);
    }, editingBinding.id ? "商品绑定已更新" : `已成功绑定 ${productsToSave.length} 个商品`);
  }
  async function removeBinding(binding: ProductBindingView) { if (!confirm(`确认解除“${binding.productTitle}”的模板绑定？`)) return; await run(async () => { await apiJson(`/api/products/${binding.id}`, { method: "DELETE" }); await loadBindings(); }, "商品绑定已删除"); }
  async function syncBinding(binding: ProductBindingView) { await run(async () => { await apiJson(`/api/products/${binding.id}/sync`, { method: "POST" }); await loadBindings(); }, `“${binding.productTitle}”已重新同步`); }
  async function previewBinding(binding: ProductBindingView) { await run(async () => { const payload = await apiJson<unknown>(`/api/products/${binding.id}/storefront-preview`); alert(JSON.stringify(payload.data, null, 2)); }, `已生成“${binding.productTitle}”的 Storefront 配置`); }

  function newCustomerProfile() {
    const binding = bindings.find((item) => item.enabled);
    setCustomerProfileDraft({ id: "", shopId: binding?.shopId ?? "", customerId: "", unit: "CM", schemaVersion: 2, measurements: {} });
  }
  async function editCustomerProfile(profile: MeasurementProfileAdminView) {
    await run(async () => {
      const payload = await apiJson<CustomerMeasurementProfileDetail>(`/api/measurement-profiles/${profile.id}`);
      if (!payload.data) throw new Error("客户量体资料不存在");
      setCustomerProfileDraft({ id: payload.data.id, shopId: payload.data.shopId, customerId: payload.data.customerId ?? "", unit: payload.data.unit, schemaVersion: payload.data.schemaVersion, measurements: payload.data.measurements });
    }, "已加载客户量体资料");
  }
  async function saveCustomerProfile() {
    if (!customerProfileDraft) return;
    if (!customerProfileDraft.shopId) return setNotice({ type: "error", text: "请填写店铺域名" });
    await run(async () => {
      await apiJson(customerProfileDraft.id ? `/api/measurement-profiles/${customerProfileDraft.id}` : "/api/measurement-profiles", jsonRequest(customerProfileDraft.id ? "PUT" : "POST", { shopId: customerProfileDraft.shopId, customerId: customerProfileDraft.customerId, unit: customerProfileDraft.unit, schemaVersion: customerProfileDraft.schemaVersion, measurements: customerProfileDraft.measurements }));
      setCustomerProfileDraft(null);
      await loadMeasurementProfiles();
    }, customerProfileDraft.id ? "客户量体资料已更新" : "客户量体资料已创建");
  }
  async function removeCustomerProfile(profile: MeasurementProfileAdminView) {
    const ownerLabel = profile.ownerType === "customer" ? `Customer ${profile.customerId}` : `匿名设备 Guest …${profile.id.slice(-8)}`;
    if (!confirm(`确认删除 ${ownerLabel} 的量体资料？历史订单快照不会被删除。`)) return;
    await run(async () => { await apiJson(`/api/measurement-profiles/${profile.id}`, { method: "DELETE" }); if (customerProfileDraft?.id === profile.id) setCustomerProfileDraft(null); await loadMeasurementProfiles(); }, "客户量体资料已删除");
  }
  function filterMeasurementProfiles(filter: MeasurementProfileFilter) { setMeasurementProfileFilter(filter); void loadMeasurementProfiles(filter, 1).catch(handleError); }
  function pageMeasurementProfiles(page: number) { void loadMeasurementProfiles(measurementProfileFilter, page).catch(handleError); }

  async function saveCategory() { if(!categoryDraft)return; await run(async()=>{ await apiJson(categoryDraft.id?`/api/template-categories/${categoryDraft.id}`:"/api/template-categories",jsonRequest(categoryDraft.id?"PUT":"POST",categoryDraft)); setCategoryDraft(null); await Promise.all([loadCategories(),loadTemplates()]); },categoryDraft.id?"品类已更新":"品类已创建"); }
  async function removeCategory(category:TemplateCategoryView) { if(!confirm(`确认删除品类“${category.name}”？`))return; await run(async()=>{ await apiJson(`/api/template-categories/${category.id}`,{method:"DELETE"}); await loadCategories(); },"品类已删除"); }

  async function saveMeasurementAttribute() {
    if (!measurementAttributeDraft) return;
    await run(async () => {
      await apiJson(measurementAttributeDraft.id ? `/api/measurement-attributes/${measurementAttributeDraft.id}` : "/api/measurement-attributes", jsonRequest(measurementAttributeDraft.id ? "PUT" : "POST", measurementAttributeDraft));
      setMeasurementAttributeDraft(null);
      await loadMeasurementAttributes();
    }, measurementAttributeDraft.id ? "量体属性已更新" : "量体属性已创建");
  }
  async function removeMeasurementAttribute(attribute: MeasurementAttributeView) {
    if (!confirm(`确认删除量体属性“${attribute.name}”？`)) return;
    await run(async () => { await apiJson(`/api/measurement-attributes/${attribute.id}`, { method: "DELETE" }); if (measurementAttributeDraft?.id === attribute.id) setMeasurementAttributeDraft(null); await loadMeasurementAttributes(); }, "量体属性已删除");
  }
  async function toggleMeasurementAttribute(attribute: MeasurementAttributeView) {
    await run(async () => { await apiJson(`/api/measurement-attributes/${attribute.id}`, jsonRequest("PUT", { ...attribute, enabled: !attribute.enabled })); await loadMeasurementAttributes(); }, attribute.enabled ? "量体属性已停用" : "量体属性已启用");
  }

  function navigate(next: AdminView) { setView(next); setNotice(null); if (next === "categories") void loadCategories().catch(handleError); if (next === "measurement-attributes") void loadMeasurementAttributes().catch(handleError); if (next === "products") void loadBindings().catch(handleError); if (next === "customers") void loadMeasurementProfiles().catch(handleError); }
  function openTab(next: TemplateTab) { setTab(next); if (next === "versions") void loadVersions().catch(handleError); }

  if (accessDenied) return <AccessDeniedPage />;
  if (initializing) return <div className="admin-loading" role="status">正在验证管理权限…</div>;

  return <AdminShell view={view} onNavigate={navigate}>
    {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
    {view === "templates" && <TemplateWorkspace
      items={items} categories={categories} measurementAttributes={measurementAttributes} filtered={filtered} draft={draft} selected={selected} published={published} bindings={bindings} search={search} tab={tab} versions={versions} busy={busy}
      onSearch={setSearch} onChoose={choose} onCreate={() => create()} onCopy={() => draft && create(draft)} onDelete={removeTemplate} onSave={() => save()} onPublish={() => save(true)} onTab={openTab}
      onDraft={updateDraft} onTemplateType={setTemplateType}
      onAddComponent={addComponent} onUpdateComponent={updateComponent} onRemoveComponent={removeComponent}
      onAddStep={addStep} onUpdateStep={updateStep} onUpdateTextInput={updateTextInput} onRemoveStep={removeStep} onAddOption={addOption} onUpdateOption={updateOption} onRemoveOption={removeOption}
      onAddBlock={addMeasurementBlock} onUpdateBlock={updateMeasurementBlock} onRemoveBlock={removeMeasurementBlock} onAddField={addMeasurementField} onUpdateField={updateMeasurementField} onRemoveField={removeMeasurementField}
    />}
    {view === "categories" && <TemplateCategories categories={categories} draft={categoryDraft} onDraft={setCategoryDraft} onSave={()=>void saveCategory()} onDelete={(category)=>void removeCategory(category)}/>}
    {view === "measurement-attributes" && <MeasurementAttributes items={measurementAttributes} draft={measurementAttributeDraft} onDraft={setMeasurementAttributeDraft} onSave={() => void saveMeasurementAttribute()} onDelete={(attribute) => void removeMeasurementAttribute(attribute)} onToggle={(attribute) => void toggleMeasurementAttribute(attribute)} onRefresh={() => void loadMeasurementAttributes().catch(handleError)}/>}
    {view === "products" && <ProductBindingsNew items={items} bindings={bindings} editing={editingBinding} selectedProducts={bindingProducts} versions={bindingVersions} embedded={isShopifyEmbedded()} onPick={pickProduct} onRemoveSelected={(gid) => setBindingProducts((current) => current.filter((product) => product.gid !== gid))} onNew={newBinding} onEdit={editBinding} onRemove={removeBinding} onSync={syncBinding} onPreview={previewBinding} onChange={(binding) => setEditingBinding(binding)} onTemplateChange={(templateId) => { if (!editingBinding) return; setEditingBinding({ ...editingBinding, templateId, publishedVersion: null }); void loadBindingVersions(templateId).catch(handleError); }} onCancel={() => { setEditingBinding(null); setBindingProducts([]); }} onSave={saveBinding} />}
    {view === "customers" && <CustomerProfiles result={measurementProfileResult} filter={measurementProfileFilter} bindings={bindings} templates={items} draft={customerProfileDraft} onDraft={setCustomerProfileDraft} onFilter={filterMeasurementProfiles} onPage={pageMeasurementProfiles} onNew={newCustomerProfile} onEdit={(profile) => void editCustomerProfile(profile)} onDelete={(profile) => void removeCustomerProfile(profile)} onSave={() => void saveCustomerProfile()} onCancel={() => setCustomerProfileDraft(null)} onRefresh={() => void loadMeasurementProfiles().catch(handleError)} />}
  </AdminShell>;
}

function AccessDeniedPage() {
  return <main className="access-denied-page">
    <section className="access-denied-card" aria-labelledby="access-denied-title">
      <div className="access-denied-code">403</div>
      <div className="access-denied-icon" aria-hidden="true">×</div>
      <h1 id="access-denied-title">无权访问管理后台</h1>      
    </section>
  </main>;
}

type CustomerProfileDraft = { id: string; shopId: string; customerId: string; unit: "CM" | "IN"; schemaVersion: number; measurements: Record<string, number | string> };

function TemplateCategories({categories,draft,onDraft,onSave,onDelete}:{categories:TemplateCategoryView[];draft:{id:string;code:string;name:string;sortOrder:number}|null;onDraft:(value:{id:string;code:string;name:string;sortOrder:number}|null)=>void;onSave:()=>void;onDelete:(category:TemplateCategoryView)=>void}) {
  return <><div className="head"><div><h2>模板品类</h2><p>维护模板可选品类；已有模板引用的品类不能删除。</p></div><button className="primary" onClick={()=>onDraft({id:"",code:"",name:"",sortOrder:categories.length*10+10})}>＋ 新建品类</button></div>{draft&&<section className="panel binding-form"><div className="form"><Field label="品类编码"><input value={draft.code} disabled={Boolean(draft.id)} onChange={(event)=>onDraft({...draft,code:event.target.value})}/></Field><Field label="品类名称"><input value={draft.name} onChange={(event)=>onDraft({...draft,name:event.target.value})}/></Field><Field label="排序"><input type="number" min="0" value={draft.sortOrder} onChange={(event)=>onDraft({...draft,sortOrder:Number(event.target.value)})}/></Field></div><div className="actions"><button className="secondary" onClick={()=>onDraft(null)}>取消</button><button className="primary" disabled={!draft.code.trim()||!draft.name.trim()} onClick={onSave}>保存品类</button></div></section>}<div className="panel table-wrap"><table><thead><tr><th>名称</th><th>编码</th><th>排序</th><th>模板数</th><th>操作</th></tr></thead><tbody>{categories.map((category)=><tr key={category.id}><td><strong>{category.name}</strong></td><td><code>{category.code}</code></td><td>{category.sortOrder}</td><td>{category.templateCount}</td><td><button className="link" onClick={()=>onDraft({id:category.id,code:category.code,name:category.name,sortOrder:category.sortOrder})}>编辑</button><button className="link danger-text" disabled={category.templateCount>0} title={category.templateCount>0?"该品类下已有模板，不能删除":""} onClick={()=>onDelete(category)}>删除</button></td></tr>)}</tbody></table></div></>;
}

function CustomerProfiles({ result, filter, bindings, templates, draft, onDraft, onFilter, onPage, onNew, onEdit, onDelete, onSave, onCancel, onRefresh }: { result: MeasurementProfilePage; filter: MeasurementProfileFilter; bindings: ProductBindingView[]; templates: TemplateView[]; draft: CustomerProfileDraft | null; onDraft: (draft: CustomerProfileDraft | null) => void; onFilter: (filter: MeasurementProfileFilter) => void; onPage: (page: number) => void; onNew: () => void; onEdit: (profile: MeasurementProfileAdminView) => void; onDelete: (profile: MeasurementProfileAdminView) => void; onSave: () => void; onCancel: () => void; onRefresh: () => void }) {
  void templates;
  const filterLabel = { all: "全部资料", customer: "登录客户", guest: "匿名资料", activeGuest: "有效匿名资料" }[filter];
  function chooseFilter(next: MeasurementProfileFilter) { onFilter(filter === next ? "all" : next); }
  const shops = [...new Set(bindings.map((item) => item.shopId))];
  const commonFieldNames: Record<string, string> = { height: "身高", weight: "体重", sleeve_length: "袖长", chest: "胸围", waist: "腰围", hip: "臀围", shoulder_width: "肩宽", inseam: "裤内长", neck: "领围" };
  function fieldName(code: string) { return commonFieldNames[code] ?? (/^field_(\d+)$/.exec(code)?.[1] ? `量体字段 ${/^field_(\d+)$/.exec(code)?.[1]}` : code); }
  function removeField(code: string) { if (!draft) return; const next = { ...draft.measurements }; delete next[code]; onDraft({ ...draft, measurements: next }); }
  useEffect(() => {
    if (!draft) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("modal-open");
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.classList.remove("modal-open"); };
  }, [draft, onCancel]);
  return <>
    <div className="head"><div><h2>客户量体资料</h2><p>统一管理登录客户与匿名设备的量体资料。</p></div><div className="actions"><button className="secondary" onClick={onRefresh}>刷新</button><button className="primary" onClick={onNew}>＋ 添加客户资料</button></div></div>
    <section className="stats" aria-label="客户资料筛选"><Stat label="资料总数" value={result.stats.total} active={filter === "all"} onClick={() => chooseFilter("all")}/><Stat label="登录客户" value={result.stats.customer} active={filter === "customer"} onClick={() => chooseFilter("customer")}/><Stat label="匿名资料" value={result.stats.guest} active={filter === "guest"} onClick={() => chooseFilter("guest")}/><Stat label="有效匿名资料" value={result.stats.activeGuest} active={filter === "activeGuest"} onClick={() => chooseFilter("activeGuest")}/></section>
    {draft && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title"><header className="customer-modal-header"><div><h3 id="customer-modal-title">{draft.id ? (draft.customerId ? "编辑客户量体资料" : "编辑匿名设备资料") : "添加客户量体资料"}</h3><p>{draft.customerId ? `Customer ${draft.customerId}` : draft.id ? "匿名设备资料" : "为已登录客户创建量体资料"}</p></div><button className="modal-close" aria-label="关闭" onClick={onCancel}>×</button></header><div className="customer-modal-body"><section className="modal-section"><h4>基本信息</h4><div className="customer-profile-fields"><Field label={draft.id && !draft.customerId ? "资料归属" : "客户 ID"}><input value={draft.id && !draft.customerId ? "匿名设备" : draft.customerId} disabled={Boolean(draft.id)} inputMode="numeric" placeholder="Shopify Customer 数字 ID" onChange={(event) => onDraft({ ...draft, customerId: event.target.value })}/></Field><Field label="店铺"><input value={draft.shopId} disabled={Boolean(draft.id)} list="customer-shop-list" placeholder="example.myshopify.com" onChange={(event) => onDraft({ ...draft, shopId: event.target.value })}/><datalist id="customer-shop-list">{shops.map((shop) => <option key={shop} value={shop}/>)}</datalist></Field><Field label="显示单位"><select value={draft.unit} onChange={(event) => onDraft({ ...draft, unit: event.target.value as "CM" | "IN" })}><option value="CM">厘米（CM）</option><option value="IN">英寸（IN）</option></select></Field></div></section><section className="modal-section"><div className="modal-section-heading"><div><h4>量体数据</h4><p>字段编码由系统维护，仅需调整数值。</p></div><span>{Object.keys(draft.measurements).length} 项</span></div><div className="measurement-card-grid">{Object.entries(draft.measurements).map(([code, value]) => <div className="measurement-card" key={code}><div className="measurement-card-heading"><label htmlFor={`measurement-${code}`}>{fieldName(code)}</label><button className="delete" aria-label={`删除${fieldName(code)}`} onClick={() => removeField(code)}>删除</button></div><div className="measurement-input-wrap"><input id={`measurement-${code}`} aria-label={`${fieldName(code)}数值`} type="number" step="any" value={value} onChange={(event) => onDraft({ ...draft, measurements: { ...draft.measurements, [code]: event.target.value } })}/><span>{draft.unit}</span></div></div>)}{!Object.keys(draft.measurements).length && <div className="empty modal-empty">暂无量体字段。</div>}</div></section></div><footer className="customer-modal-footer"><button className="secondary" onClick={onCancel}>取消</button><button className="primary" disabled={(!draft.id && !draft.customerId) || !draft.shopId || !Object.keys(draft.measurements).length || Object.entries(draft.measurements).some(([code, value]) => !code.trim() || value === "")} onClick={onSave}>保存客户资料</button></footer></section></div>}
    <div className="customer-filter-result"><strong>{filterLabel}</strong><span>共 {result.total} 条</span>{filter !== "all" && <button className="link" onClick={() => onFilter("all")}>清除筛选</button>}</div>
    <div className="panel table-wrap"><table><thead><tr><th>归属</th><th>客户/设备</th><th>店铺</th><th>单位</th><th>字段</th><th>更新时间</th><th>过期时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{result.items.map((profile) => {
      const expired = Boolean(profile.expiresAt && new Date(profile.expiresAt) <= new Date());
      return <tr key={profile.id}><td><span className={`badge ${profile.ownerType === "customer" ? "published" : "draft"}`}>{profile.ownerType === "customer" ? "登录客户" : "匿名设备"}</span></td><td>{profile.customerId ? <><strong>{profile.customerName || "未获取姓名"}</strong><small>{profile.customerEmail || "未获取邮箱"}</small></> : <strong>{`Guest …${profile.id.slice(-8)}`}</strong>}</td><td>{profile.shopId}</td><td>{profile.unit}</td><td>{profile.fieldCount} 项</td><td>{new Date(profile.updatedAt).toLocaleString("zh-CN")}</td><td>{profile.expiresAt ? new Date(profile.expiresAt).toLocaleString("zh-CN") : "账号长期保存"}</td><td><span className={`badge ${expired ? "draft" : "published"}`}>{expired ? "已过期" : "有效"}</span></td><td><button className="link" onClick={() => onEdit(profile)}>编辑</button><button className="link danger-text" onClick={() => onDelete(profile)}>删除</button></td></tr>;
    })}</tbody></table>{!result.items.length && <div className="empty">{result.stats.total ? "当前筛选条件下暂无客户资料。" : "暂无已保存的量体资料。可先通过商品定制器保存一条测试资料。"}</div>}{result.total > 0 && <div className="pagination"><span>第 {result.page} / {result.totalPages} 页</span><span>每页 {result.pageSize} 条</span><button className="secondary" disabled={result.page <= 1} onClick={() => onPage(result.page - 1)}>上一页</button><button className="secondary" disabled={result.page >= result.totalPages} onClick={() => onPage(result.page + 1)}>下一页</button></div>}</div>
    <div className="notice success">登录客户和匿名设备资料均可编辑量体数值；匿名资料仍由 Cookie 身份关联，后台不可改变其归属。删除当前资料不影响历史订单快照。</div>
  </>;
}

type TemplateWorkspaceProps = {
  items: TemplateView[]; categories: TemplateCategoryView[]; measurementAttributes: MeasurementAttributeView[]; filtered: TemplateView[]; draft: TemplateView | null; selected: string; published: number; bindings: ProductBindingView[]; search: string; tab: TemplateTab; versions: TemplateVersionView[]; busy: boolean;
  onSearch: (value: string) => void; onChoose: (item: TemplateView) => void; onCreate: () => void; onCopy: () => void; onDelete: () => void; onSave: () => void; onPublish: () => void; onTab: (tab: TemplateTab) => void;
  onDraft: (update: (draft: TemplateView) => void) => void; onTemplateType: (type: TemplateType) => void;
  onAddComponent: () => void; onUpdateComponent: (index: number, key: keyof GarmentComponentDefinition, value: string | boolean | number) => void; onRemoveComponent: (index: number) => void;
  onAddStep: () => void; onUpdateStep: (index: number, key: keyof CustomizationStep, value: string | boolean | number) => void; onUpdateTextInput: (index: number, key: keyof TextInputConfig, value: string | number) => void; onRemoveStep: (index: number) => void;
  onAddOption: (step: number) => void; onUpdateOption: (step: number, option: number, key: keyof CustomizationOption, value: string | boolean | number | GarmentCategory[]) => void; onRemoveOption: (step: number, option: number) => void;
  onAddBlock: () => void; onUpdateBlock: (index: number, key: keyof MeasurementBlock, value: string | boolean | number | GarmentCategory[]) => void; onRemoveBlock: (index: number) => void;
  onAddField: (block: number) => void; onUpdateField: (block: number, field: number, key: keyof MeasurementFieldDefinition, value: string | boolean | number) => void; onRemoveField: (block: number, field: number) => void;
};

function TemplateWorkspace(props: TemplateWorkspaceProps) {
  const { draft } = props;
  return <>
    <div className="head"><div><h2>定制模板</h2><p>维护模板、组合/套装、定制步骤和尺寸定义。</p></div><button className="primary" disabled={props.busy} onClick={props.onCreate}>＋ 新建模板</button></div>
    <section className="stats"><Stat label="模板总数" value={props.items.length}/><Stat label="已发布" value={props.published}/><Stat label="草稿" value={props.items.length - props.published}/><Stat label="关联商品" value={props.bindings.length}/></section>
    <div className="work">
      <section className="panel"><div className="panel-title">模板列表</div><div className="search-wrap"><input className="search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="搜索模板名称或编码"/></div><div className="list">{props.filtered.map((item) => <button key={item.id} className={`card ${item.id === props.selected ? "active" : ""}`} onClick={() => props.onChoose(item)}><strong>{item.name}<span className={`badge ${item.status}`}>{item.status === "published" ? "已发布" : "草稿"}</span></strong><small>{item.code} · v{item.version} · {item.categoryLabel}</small></button>)}</div></section>
      <section className="panel">{!draft ? <div className="empty">暂无模板，请新建</div> : <div className="editor">
        <div className="editor-head"><div><h3>{draft.name}</h3><p>{draft.code} · 当前版本 v{draft.version} · Schema v{draft.schemaVersion}</p></div><div className="actions"><button className="secondary" onClick={props.onCopy}>复制</button><button className="danger" onClick={props.onDelete}>删除</button><button className="secondary" disabled={props.busy} onClick={props.onSave}>保存草稿</button><button className="primary" disabled={props.busy} onClick={props.onPublish}>校验并发布</button></div></div>
        <div className="tabs">{([['base','基础信息'],['components','组合/套装'],['steps','定制步骤'],['measurements','尺寸定义'],['versions','发布记录'],['json','JSON 预览']] as Array<[TemplateTab,string]>).filter(([key]) => key !== "components" || draft.config.templateType === "composite").map(([key,label]) => <button key={key} className={props.tab === key ? "active" : ""} onClick={() => props.onTab(key)}>{label}</button>)}</div>
        {props.tab === "base" && <BaseTab draft={draft} categories={props.categories} onDraft={props.onDraft} onTemplateType={props.onTemplateType}/>}
        {props.tab === "components" && <ComponentsTab draft={draft} items={props.items} categories={props.categories} onAdd={props.onAddComponent} onUpdate={props.onUpdateComponent} onRemove={props.onRemoveComponent}/>}
        {props.tab === "steps" && <AdvancedStepsTab draft={draft} onAdd={props.onAddStep} onUpdate={props.onUpdateStep} onUpdateTextInput={props.onUpdateTextInput} onRemove={props.onRemoveStep} onAddOption={props.onAddOption} onUpdateOption={props.onUpdateOption} onRemoveOption={props.onRemoveOption}/>}
        {props.tab === "measurements" && <MeasurementsTab draft={draft} attributes={props.measurementAttributes} onAddBlock={props.onAddBlock} onUpdateBlock={props.onUpdateBlock} onRemoveBlock={props.onRemoveBlock} onAddField={props.onAddField} onUpdateField={props.onUpdateField} onRemoveField={props.onRemoveField}/>}
        {props.tab === "versions" && <VersionsTab versions={props.versions}/>}
        {props.tab === "json" && <><Section title="Schema v2 发布快照"/><pre className="json">{JSON.stringify(draft.config, null, 2)}</pre></>}
      </div>}</section>
    </div>
  </>;
}

function BaseTab({ draft, categories, onDraft, onTemplateType }: { draft: TemplateView; categories:TemplateCategoryView[]; onDraft: TemplateWorkspaceProps["onDraft"]; onTemplateType: (type: TemplateType) => void }) {
  return <div className="form form-section"><Field label="模板名称"><input value={draft.name} onChange={(event) => onDraft((next) => { next.name = event.target.value; })}/></Field><Field label="模板编码"><input value={draft.code} onChange={(event) => onDraft((next) => { next.code = event.target.value; })}/></Field><Field label="模板类型"><select value={draft.config.templateType} onChange={(event) => onTemplateType(event.target.value as TemplateType)}><option value="single">单品模板</option><option value="composite">组合/套装模板</option></select></Field><Field label="适用品类"><select value={draft.category} disabled={draft.config.templateType === "composite"} onChange={(event) => onDraft((next) => { next.category = event.target.value as GarmentCategory; })}>{categories.map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}</select></Field><Field label="前台按钮文字"><input value={draft.config.buttonLabel} onChange={(event) => onDraft((next) => { next.config.buttonLabel = event.target.value; })}/></Field><Field label="价格规则"><input value="所有定制项不影响价格" disabled/></Field></div>;
}

function ComponentsTab({ draft, items, categories:categoryRows, onAdd, onUpdate, onRemove }: { draft: TemplateView; items: TemplateView[]; categories:TemplateCategoryView[]; onAdd: () => void; onUpdate: TemplateWorkspaceProps["onUpdateComponent"]; onRemove: (index: number) => void }) {
  const categories=categoryRows.map((category)=>[category.code,category.name] as const);
  if (draft.config.templateType !== "composite") return <div className="empty">单品模板不包含组合/套装配置。</div>;
  const childTemplates = items.filter((item) => item.id !== draft.id && item.status === "published" && item.config.templateType === "single");
  return <><Section title="固定逻辑组件" action={<button className="secondary" onClick={onAdd}>＋ 添加组件</button>}/><p className="section-help">上衣、西裤和马甲是生产逻辑组件，不是 Shopify 独立商品；消费者不能增删。</p><div className="steps">{sortByOrder(draft.config.components).map((component, index) => <div className="step" key={component.id}><div className="component-grid"><Field label="组件名称"><input value={component.name} onChange={(event) => onUpdate(index, "name", event.target.value)}/></Field><Field label="组件编码"><input value={component.code} onChange={(event) => onUpdate(index, "code", event.target.value)}/></Field><Field label="组件品类"><select value={component.category} onChange={(event) => onUpdate(index, "category", event.target.value)}>{categories.filter(([value]) => value !== "suit").map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="子定制模板"><select value={component.childTemplateId} onChange={(event) => onUpdate(index, "childTemplateId", event.target.value)}><option value="">请选择已发布单品模板</option>{childTemplates.filter((item) => item.category === component.category).map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></Field><Field label="排序"><input type="number" min="0" value={component.sortOrder} onChange={(event) => onUpdate(index, "sortOrder", Number(event.target.value))}/></Field></div><div className="row-actions"><label><input type="checkbox" checked={component.customizationEnabled} onChange={(event) => onUpdate(index, "customizationEnabled", event.target.checked)}/> 启用定制</label><label><input type="checkbox" checked={component.required} onChange={(event) => onUpdate(index, "required", event.target.checked)}/> 必需组件</label><button className="delete" onClick={() => onRemove(index)}>删除组件</button></div></div>)}{!draft.config.components.length && <div className="empty">暂无逻辑组件。</div>}</div></>;
}

function StepsTab({ draft, onAdd, onUpdate, onRemove, onAddOption, onUpdateOption, onRemoveOption }: { draft: TemplateView; onAdd: () => void; onUpdate: TemplateWorkspaceProps["onUpdateStep"]; onRemove: (index: number) => void; onAddOption: (index: number) => void; onUpdateOption: TemplateWorkspaceProps["onUpdateOption"]; onRemoveOption: (step: number, option: number) => void }) {
  return <><Section title="定制步骤" action={<button className="secondary" onClick={onAdd}>＋ 添加步骤</button>}/><div className="steps">{sortByOrder(draft.config.steps).map((step, index) => <div className="step" key={step.id}><div className="step-row"><span className="num">{index + 1}</span><input value={step.title} aria-label="步骤名称" onChange={(event) => onUpdate(index, "title", event.target.value)}/><select value={step.type} aria-label="步骤类型" onChange={(event) => onUpdate(index, "type", event.target.value)}>{stepTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button className="delete" onClick={() => onRemove(index)}>删除</button></div><div className="form compact-form"><Field label="步骤编码"><input value={step.code} onChange={(event) => onUpdate(index, "code", event.target.value)}/></Field><Field label="展示方式"><select value={step.displayType ?? "radio"} disabled={step.type !== "options"} onChange={(event) => onUpdate(index, "displayType", event.target.value)}>{displayTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="步骤说明"><input value={step.description ?? ""} onChange={(event) => onUpdate(index, "description", event.target.value)}/></Field><Field label="排序"><input type="number" min="0" value={step.sortOrder} onChange={(event) => onUpdate(index, "sortOrder", Number(event.target.value))}/></Field><Field label="状态"><span className="check-row"><label><input type="checkbox" checked={step.enabled} onChange={(event) => onUpdate(index, "enabled", event.target.checked)}/> 启用</label><label><input type="checkbox" checked={step.required} onChange={(event) => onUpdate(index, "required", event.target.checked)}/> 必填</label></span></Field></div>{step.type === "options" && <div className="choice-editor"><div className="choice-head"><strong>候选选项</strong><button className="secondary" onClick={() => onAddOption(index)}>＋ 添加选项</button></div>{sortByOrder(step.options).map((option, optionIndex) => <div className="option-card" key={option.id}><div className="choice-row"><input value={option.name} aria-label="选项名称" placeholder="显示名称" onChange={(event) => onUpdateOption(index, optionIndex, "name", event.target.value)}/><input value={option.code} aria-label="选项编码" placeholder="稳定编码" onChange={(event) => onUpdateOption(index, optionIndex, "code", event.target.value)}/><input value={option.description ?? ""} aria-label="选项说明" placeholder="选项说明（可选）" onChange={(event) => onUpdateOption(index, optionIndex, "description", event.target.value)}/><input value={option.imageUrl ?? ""} aria-label="选项图片" placeholder="图片 URL（可选）" onChange={(event) => onUpdateOption(index, optionIndex, "imageUrl", event.target.value)}/><button className="delete" onClick={() => onRemoveOption(index, optionIndex)}>删除</button></div><div className="row-actions"><label><input type="checkbox" checked={option.enabled} onChange={(event) => onUpdateOption(index, optionIndex, "enabled", event.target.checked)}/> 启用</label><label><input type="checkbox" checked={option.defaultSelected} onChange={(event) => onUpdateOption(index, optionIndex, "defaultSelected", event.target.checked)}/> 默认选中</label><label>排序 <input className="inline-number" type="number" min="0" value={option.sortOrder} onChange={(event) => onUpdateOption(index, optionIndex, "sortOrder", Number(event.target.value))}/></label><span>适用品类：{option.applicableCategories.map((category) => garmentCategoryLabels[category]).join("、") || "未设置"}</span><span className="fixed-rule">不影响价格</span></div></div>)}{!step.options.length && <p className="choice-empty">暂无候选选项。</p>}</div>}</div>)}{!draft.config.steps.length && <div className="empty">暂无定制步骤。</div>}</div></>;
}

type AdvancedStepsTabProps = {
  draft: TemplateView;
  onAdd: () => void;
  onUpdate: TemplateWorkspaceProps["onUpdateStep"];
  onUpdateTextInput: TemplateWorkspaceProps["onUpdateTextInput"];
  onRemove: (index: number) => void;
  onAddOption: (index: number) => void;
  onUpdateOption: TemplateWorkspaceProps["onUpdateOption"];
  onRemoveOption: (step: number, option: number) => void;
};

function AdvancedStepsTab({ draft, onAdd, onUpdate, onUpdateTextInput, onRemove, onAddOption, onUpdateOption, onRemoveOption }: AdvancedStepsTabProps) {
  return <>
    <Section title="定制步骤" action={<button className="secondary" onClick={onAdd}>＋ 添加步骤</button>}/>
    <p className="section-help">刺绣定制在一个步骤内完成；位置、字体和颜色暂使用系统默认字典。</p>
    <div className="steps">
      {sortByOrder(draft.config.steps).map((step, index) => {
        const isTextInput = step.type === "embroidery" || (step.type === "options" && step.displayType === "text_input");
        return <div className="step" key={step.id}>
          <div className="step-row">
            <span className="num">{index + 1}</span>
            <input value={step.title} aria-label="步骤名称" onChange={(event) => onUpdate(index, "title", event.target.value)}/>
            <select value={step.type} aria-label="步骤类型" onChange={(event) => onUpdate(index, "type", event.target.value)}>{stepTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button className="delete" onClick={() => onRemove(index)}>删除</button>
          </div>
          <div className="form compact-form">
            <Field label="步骤编码"><input value={step.code} onChange={(event) => onUpdate(index, "code", event.target.value)}/></Field>
            <Field label="展示方式"><select value={step.displayType ?? "radio"} disabled={step.type !== "options"} onChange={(event) => onUpdate(index, "displayType", event.target.value)}>{displayTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="步骤说明"><input value={step.description ?? ""} onChange={(event) => onUpdate(index, "description", event.target.value)}/></Field>
            <Field label="排序"><input type="number" min="0" value={step.sortOrder} onChange={(event) => onUpdate(index, "sortOrder", Number(event.target.value))}/></Field>
            <Field label="状态"><span className="check-row"><label><input type="checkbox" checked={step.enabled} onChange={(event) => onUpdate(index, "enabled", event.target.checked)}/> 启用</label><label><input type="checkbox" checked={step.required} onChange={(event) => onUpdate(index, "required", event.target.checked)}/> 必填</label></span></Field>
          </div>
          {isTextInput ? <div className="choice-editor">
            {step.type !== "embroidery" && <div className="choice-head"><strong>文本输入规则</strong></div>}
            <div className="form compact-form">
              <Field label="最小字符数"><input type="number" min="0" max="200" value={step.textInput?.minLength ?? 0} onChange={(event) => onUpdateTextInput(index, "minLength", Number(event.target.value))}/></Field>
              <Field label="最大字符数"><input type="number" min="1" max="200" value={step.textInput?.maxLength ?? 20} onChange={(event) => onUpdateTextInput(index, "maxLength", Number(event.target.value))}/></Field>
              <Field label="占位文案"><input value={step.textInput?.placeholder ?? ""} maxLength={100} placeholder="请输入刺绣文字" onChange={(event) => onUpdateTextInput(index, "placeholder", event.target.value)}/></Field>
              <Field label="字符规则"><select value={step.textInput?.characterPolicy ?? "unicode_text"} onChange={(event) => onUpdateTextInput(index, "characterPolicy", event.target.value)}><option value="unicode_text">全部 Unicode（含 emoji）</option><option value="letters_numbers_spaces">英文、数字和空格</option><option value="letters_only">仅英文字母</option></select></Field>
            </div>
          </div> : step.type === "options" && <div className="choice-editor">
            <div className="choice-head"><strong>候选选项</strong><button className="secondary" onClick={() => onAddOption(index)}>＋ 添加选项</button></div>
            {sortByOrder(step.options).map((option, optionIndex) => <div className="option-card" key={option.id}>
              <div className="choice-row">
                <input value={option.name} aria-label="选项名称" placeholder="显示名称" onChange={(event) => onUpdateOption(index, optionIndex, "name", event.target.value)}/>
                <input value={option.code} aria-label="选项编码" placeholder="稳定编码" onChange={(event) => onUpdateOption(index, optionIndex, "code", event.target.value)}/>
                <input value={option.description ?? ""} aria-label="选项说明" placeholder="选项说明（可选）" onChange={(event) => onUpdateOption(index, optionIndex, "description", event.target.value)}/>
                <input value={option.imageUrl ?? ""} aria-label="选项图片" placeholder="图片 URL（可选）" onChange={(event) => onUpdateOption(index, optionIndex, "imageUrl", event.target.value)}/>
                <button className="delete" onClick={() => onRemoveOption(index, optionIndex)}>删除</button>
              </div>
              <div className="row-actions">
                <label><input type="checkbox" checked={option.enabled} onChange={(event) => onUpdateOption(index, optionIndex, "enabled", event.target.checked)}/> 启用</label>
                <label><input type="checkbox" checked={option.defaultSelected} onChange={(event) => onUpdateOption(index, optionIndex, "defaultSelected", event.target.checked)}/> 默认选中</label>
                <label>排序 <input className="inline-number" type="number" min="0" value={option.sortOrder} onChange={(event) => onUpdateOption(index, optionIndex, "sortOrder", Number(event.target.value))}/></label>
                <span>适用品类：{option.applicableCategories.map((category) => garmentCategoryLabels[category]).join("、") || "未设置"}</span>
                <span className="fixed-rule">不影响价格</span>
              </div>
            </div>)}
            {!step.options.length && <p className="choice-empty">暂无候选选项。</p>}
          </div>}
        </div>;
      })}
      {!draft.config.steps.length && <div className="empty">暂无定制步骤。</div>}
    </div>
  </>;
}

void StepsTab;

function MeasurementsTab({ draft, attributes, onAddBlock, onUpdateBlock, onRemoveBlock, onAddField, onUpdateField, onRemoveField }: { draft: TemplateView; attributes: MeasurementAttributeView[]; onAddBlock: () => void; onUpdateBlock: TemplateWorkspaceProps["onUpdateBlock"]; onRemoveBlock: (index: number) => void; onAddField: (index: number) => void; onUpdateField: TemplateWorkspaceProps["onUpdateField"]; onRemoveField: (block: number, field: number) => void }) {
  const enabledAttributes = attributes.filter((item) => item.enabled);
  return <><Section title="量体块与元数据字段" action={<button className="secondary" onClick={onAddBlock}>＋ 添加量体块</button>}/><p className="section-help">名称、编码、数据类型和标准单位来自量体属性；模板仅配置采集规则。</p><div className="steps">{sortByOrder(draft.config.measurementBlocks).map((block, blockIndex) => <div className="step measurement-block" key={block.id}><div className="block-head"><strong>{block.name}</strong><button className="delete" onClick={() => onRemoveBlock(blockIndex)}>删除量体块</button></div><div className="form compact-form"><Field label="量体块名称"><input value={block.name} onChange={(event) => onUpdateBlock(blockIndex, "name", event.target.value)}/></Field><Field label="量体块编码"><input value={block.code} onChange={(event) => onUpdateBlock(blockIndex, "code", event.target.value)}/></Field><Field label="说明"><input value={block.description ?? ""} onChange={(event) => onUpdateBlock(blockIndex, "description", event.target.value)}/></Field><Field label="状态"><label><input type="checkbox" checked={block.enabled} onChange={(event) => onUpdateBlock(blockIndex, "enabled", event.target.checked)}/> 启用量体块</label></Field></div><div className="choice-head"><strong>量体字段</strong><button className="secondary" disabled={!enabledAttributes.length} onClick={() => onAddField(blockIndex)}>＋ 添加字段</button></div><div className="measurements-table"><div className="measurement-labels"><span>量体属性</span><span>显示名覆盖</span><span>输入单位</span><span>最小</span><span>最大</span><span>步长</span><span>状态</span><span/></div>{sortByOrder(block.fields).map((field, fieldIndex) => { const selectedAttribute = attributes.find((item) => item.id === field.attributeId); const units = selectedAttribute ? compatibleUnits(selectedAttribute.dimension) : [field.inputUnit]; return <div className="measure-row" key={field.id}><select value={field.attributeId} aria-label="量体属性" onChange={(event) => { const attribute = attributes.find((item) => item.id === event.target.value); onUpdateField(blockIndex, fieldIndex, "attributeId", event.target.value); if (attribute) onUpdateField(blockIndex, fieldIndex, "inputUnit", attribute.canonicalUnit); }}><option value="">请选择</option>{enabledAttributes.map((attribute) => <option key={attribute.id} value={attribute.id}>{attribute.name} · {attribute.code}</option>)}</select><input value={field.labelOverride ?? ""} placeholder={selectedAttribute?.name || "显示名称"} aria-label="显示名覆盖" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "labelOverride", event.target.value)}/><select value={field.inputUnit} aria-label="输入单位" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "inputUnit", event.target.value)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select><input type="number" value={field.min} aria-label="最小值" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "min", Number(event.target.value))}/><input type="number" value={field.max} aria-label="最大值" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "max", Number(event.target.value))}/><input type="number" step="any" value={field.step} aria-label="步长" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "step", Number(event.target.value))}/><label className="compact-check"><input type="checkbox" checked={field.enabled} onChange={(event) => onUpdateField(blockIndex, fieldIndex, "enabled", event.target.checked)}/> 启用</label><button className="delete" onClick={() => onRemoveField(blockIndex, fieldIndex)}>删除</button></div>;})}{!block.fields.length && <p className="choice-empty">暂无量体字段。</p>}</div></div>)}{!draft.config.measurementBlocks.length && <div className="empty">暂无量体块。</div>}</div></>;
}

function compatibleUnits(dimension: MeasurementAttributeView["dimension"]) { return dimension === "length" ? ["MM", "CM", "IN", "CHI"] : dimension === "weight" ? ["KG", "LB"] : ["NONE"]; }

function VersionsTab({ versions }: { versions: TemplateVersionView[] }) { return <><Section title="不可变发布记录"/><div className="table-wrap embedded-table"><table><thead><tr><th>版本</th><th>Schema</th><th>步骤</th><th>逻辑组件</th><th>尺寸块</th><th>发布时间</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>v{version.version}</strong></td><td>v{version.schemaVersion}</td><td>{version.config.steps.length}</td><td>{version.config.components.length}</td><td>{version.config.measurementBlocks.length}</td><td>{new Date(version.publishedAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table>{!versions.length && <div className="empty">暂无发布记录</div>}</div></>;
}

type ProductBindingsProps = { items: TemplateView[]; bindings: ProductBindingView[]; editing: ProductBindingView | null; selectedProducts: ShopifyProductSelection[]; versions: TemplateVersionView[]; embedded: boolean; onPick: () => void; onRemoveSelected: (gid: string) => void; onNew: () => void; onEdit: (binding: ProductBindingView) => void; onRemove: (binding: ProductBindingView) => void; onSync: (binding: ProductBindingView) => void; onPreview: (binding: ProductBindingView) => void; onChange: (binding: ProductBindingView) => void; onTemplateChange: (templateId: string) => void; onCancel: () => void; onSave: () => void };

function ProductBindingsNew({ items, bindings, editing, selectedProducts, versions, embedded, onPick, onRemoveSelected, onNew, onEdit, onRemove, onSync, onPreview, onChange, onTemplateChange, onCancel, onSave }: ProductBindingsProps) {
  const publishedTemplates = items.filter((item) => item.status === "published" && (editing?.productKind === "suite" ? item.config.templateType === "composite" : item.config.templateType === "single"));
  return <>
    <div className="head"><div><h2>商品绑定</h2><p>通过 Shopify 官方商品选择器绑定已发布定制模板。</p></div><button className="primary" onClick={onNew}>＋ 新建绑定</button></div>
    {editing && <div className="panel binding-form">
      {!embedded && <div className="notice warning">本地开发模式：当前使用 Mock 商品选择器，正式环境必须从 Shopify Admin 打开。</div>}
      <div className="product-picker-selection">
        <div className="product-picker-heading"><div><strong>{selectedProducts.length ? `已选择 ${selectedProducts.length} 个 Shopify 商品` : "尚未选择 Shopify 商品"}</strong><small>{editing.id ? "编辑绑定时仅可替换一个商品" : "可一次选择多个商品，并共用下方的绑定配置"}</small></div><button className="secondary" onClick={onPick}>{selectedProducts.length ? "重新选择" : "选择 Shopify 商品"}</button></div>
        {selectedProducts.map((product) => <div className="product-picker-card" key={product.gid}>{product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt || ""}/> : <div className="product-placeholder">商品</div>}<div><strong>{product.title}</strong><small>{product.gid.split("/").at(-1)} · {product.handle || "无 Handle"}</small><small>{product.status} · {product.variantCount} 个 Variants</small></div>{!editing.id && <button className="link danger-text" onClick={() => onRemoveSelected(product.gid)}>移除</button>}</div>)}
      </div>
      <div className="form">
        <Field label="商品类型"><select value={editing.productKind} onChange={(event) => onChange({ ...editing, productKind: event.target.value as ProductBindingView["productKind"], templateId: "", publishedVersion: null })}><option value="single">普通单品</option><option value="suite">普通套装</option></select></Field>
        <Field label="配置模板"><select value={editing.templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">请选择兼容的已发布模板</option>{publishedTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.categoryLabel}</option>)}</select></Field>
        <Field label="发布版本"><select value={editing.publishedVersion ?? ""} onChange={(event) => onChange({ ...editing, publishedVersion: event.target.value ? Number(event.target.value) : null })}><option value="">跟随最新发布版本</option>{versions.map((version) => <option key={version.id} value={version.version}>v{version.version}</option>)}</select></Field>
        <Field label="定制能力"><label className="switch-label"><input type="checkbox" checked={editing.enabled} onChange={(event) => onChange({ ...editing, enabled: event.target.checked })}/> 启用商品定制</label></Field>
      </div>
      <div className="actions"><button className="secondary" onClick={onCancel}>取消</button><button className="primary" disabled={!selectedProducts.length || !editing.templateId} onClick={onSave}>{editing.id ? "保存绑定" : selectedProducts.length ? `绑定 ${selectedProducts.length} 个商品` : "请选择商品"}</button></div>
    </div>}
    <div className="panel table-wrap"><table><thead><tr><th>商品</th><th>类型</th><th>模板</th><th>版本</th><th>同步</th><th>状态</th><th>操作</th></tr></thead><tbody>{bindings.map((binding) => <tr key={binding.id}><td><div className="product-table-cell">{binding.productImageUrl ? <img src={binding.productImageUrl} alt=""/> : <span/>}<div><strong>{binding.productTitle}</strong><small>{binding.shopifyProductId} · {binding.productHandle}</small></div></div></td><td>{binding.productKind === "suite" ? "普通套装" : "普通单品"}</td><td>{items.find((item) => item.id === binding.templateId)?.name ?? binding.templateId}</td><td>{binding.publishedVersion ? `v${binding.publishedVersion}` : "最新"}</td><td><span className={`badge ${binding.syncStatus === "synced" ? "published" : "draft"}`}>{binding.syncStatus === "synced" ? "已同步" : "待同步"}</span></td><td><span className={`badge ${binding.enabled ? "published" : "draft"}`}>{binding.enabled ? "已启用" : "已停用"}</span></td><td>{binding.shopifyAdminUrl && <a className="link" href={binding.shopifyAdminUrl} target="_top">Shopify</a>}<button className="link" onClick={() => onPreview(binding)}>预览</button><button className="link" onClick={() => onSync(binding)}>同步</button><button className="link" onClick={() => onEdit(binding)}>编辑</button><button className="link danger-text" onClick={() => onRemove(binding)}>删除</button></td></tr>)}</tbody></table>{!bindings.length && <div className="empty">暂无商品绑定</div>}</div>
  </>;
}

function ProductBindings({ items, bindings, editing, versions, onNew, onEdit, onRemove, onChange, onTemplateChange, onCancel, onSave }: { items: TemplateView[]; bindings: ProductBindingView[]; editing: ProductBindingView | null; versions: TemplateVersionView[]; onNew: () => void; onEdit: (binding: ProductBindingView) => void; onRemove: (binding: ProductBindingView) => void; onChange: (binding: ProductBindingView) => void; onTemplateChange: (templateId: string) => void; onCancel: () => void; onSave: () => void }) {
  const publishedTemplates = items.filter((item) => item.status === "published");
  return <><div className="head"><div><h2>商品绑定</h2><p>将普通 Shopify 商品绑定到指定的已发布模板版本。</p></div><button className="primary" onClick={onNew}>＋ 新建绑定</button></div>{editing && <div className="panel binding-form"><div className="form"><Field label="Shopify Product ID"><input value={editing.shopifyProductId} onChange={(event) => onChange({ ...editing, shopifyProductId: event.target.value })}/></Field><Field label="商品标题"><input value={editing.productTitle} onChange={(event) => onChange({ ...editing, productTitle: event.target.value })}/></Field><Field label="Handle"><input value={editing.productHandle} onChange={(event) => onChange({ ...editing, productHandle: event.target.value })}/></Field><Field label="配置模板"><select value={editing.templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">请选择已发布模板</option>{publishedTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.categoryLabel}</option>)}</select></Field><Field label="发布版本"><select value={editing.publishedVersion ?? ""} onChange={(event) => onChange({ ...editing, publishedVersion: event.target.value ? Number(event.target.value) : null })}><option value="">跟随最新发布版本</option>{versions.map((version) => <option key={version.id} value={version.version}>v{version.version}</option>)}</select></Field><Field label="定制能力"><label className="switch-label"><input type="checkbox" checked={editing.enabled} onChange={(event) => onChange({ ...editing, enabled: event.target.checked })}/> 启用商品定制</label></Field></div><div className="actions"><button className="secondary" onClick={onCancel}>取消</button><button className="primary" onClick={onSave}>保存绑定</button></div></div>}<div className="panel table-wrap"><table><thead><tr><th>商品</th><th>Product ID</th><th>模板</th><th>版本</th><th>状态</th><th>操作</th></tr></thead><tbody>{bindings.map((binding) => <tr key={binding.id}><td><strong>{binding.productTitle}</strong><small>{binding.productHandle}</small></td><td>{binding.shopifyProductId}</td><td>{items.find((item) => item.id === binding.templateId)?.name ?? binding.templateId}</td><td>{binding.publishedVersion ? `v${binding.publishedVersion}` : "最新"}</td><td><span className={`badge ${binding.enabled ? "published" : "draft"}`}>{binding.enabled ? "已启用" : "已停用"}</span></td><td><button className="link" onClick={() => onEdit(binding)}>编辑</button><button className="link danger-text" onClick={() => onRemove(binding)}>删除</button></td></tr>)}</tbody></table>{!bindings.length && <div className="empty">暂无商品绑定</div>}</div></>;
}
void ProductBindings;

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="field"><label>{label}</label>{children}</div>; }
function Section({ title, action }: { title: string; action?: React.ReactNode }) { return <div className="section-title"><h4>{title}</h4>{action}</div>; }
function Stat({ label, value, active, onClick }: { label: string; value: number; active?: boolean; onClick?: () => void }) {
  if (onClick) return <button type="button" className={`stat stat-filter${active ? " active" : ""}`} aria-pressed={active} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>;
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}
