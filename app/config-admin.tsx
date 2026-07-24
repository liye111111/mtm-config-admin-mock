"use client";

import { useEffect, useMemo, useState } from "react";
import { garmentCategoryLabels, type CustomizationOption, type CustomizationStep, type GarmentCategory, type GarmentComponentDefinition, type MeasurementBlock, type MeasurementFieldDefinition, type TemplateType } from "@/src/domain";
import { apiJson, jsonRequest } from "./admin/api";
import { AdminShell, type AdminView } from "./admin/app-shell";
import type { ProductBindingView, TemplateTab, TemplateVersionView, TemplateView } from "./admin/types";

const categories = Object.entries(garmentCategoryLabels) as Array<[GarmentCategory, string]>;
const stepTypes: Array<[CustomizationStep["type"], string]> = [["variant", "SKU 选择"], ["options", "定制选项"], ["components", "组合/套装"], ["measurements", "量体尺寸"], ["review", "配置确认"]];
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
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingBinding, setEditingBinding] = useState<ProductBindingView | null>(null);

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
  async function loadVersions(templateId = selected) { if (!templateId) return setVersions([]); const payload = await apiJson<TemplateVersionView[]>(`/api/templates/${templateId}/versions`); setVersions(payload.data ?? []); }
  async function loadBindingVersions(templateId: string) { if (!templateId) return setBindingVersions([]); const payload = await apiJson<TemplateVersionView[]>(`/api/templates/${templateId}/versions`); setBindingVersions(payload.data ?? []); }

  // Initial API hydration intentionally updates local UI state.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void Promise.all([loadTemplates(), loadBindings()]).catch((error: Error) => setNotice({ type: "error", text: error.message })); }, []);

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

  async function run(work: () => Promise<void>, success: string) {
    setBusy(true); setNotice(null);
    try { await work(); setNotice({ type: "success", text: success }); }
    catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "操作失败" }); }
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
  function updateStep(index: number, key: keyof CustomizationStep, value: string | boolean | number) { updateDraft((next) => { (next.config.steps[index] as unknown as Record<string, unknown>)[key] = value; }); }
  function removeStep(index: number) { updateDraft((next) => { next.config.steps.splice(index, 1); next.config.steps.forEach((item, order) => { item.sortOrder = order; }); }); }
  function addOption(stepIndex: number) { updateDraft((next) => { const options = next.config.steps[stepIndex].options; const index = options.length; options.push({ id: crypto.randomUUID(), code: `option_${index + 1}`, name: "新选项", sortOrder: index, enabled: true, defaultSelected: false, applicableCategories: [next.category], affectsPrice: false }); }); }
  function updateOption(stepIndex: number, optionIndex: number, key: keyof CustomizationOption, value: string | boolean | number | GarmentCategory[]) { updateDraft((next) => { (next.config.steps[stepIndex].options[optionIndex] as unknown as Record<string, unknown>)[key] = value; }); }
  function removeOption(stepIndex: number, optionIndex: number) { updateDraft((next) => { const options = next.config.steps[stepIndex].options; options.splice(optionIndex, 1); options.forEach((item, order) => { item.sortOrder = order; }); }); }

  function addMeasurementBlock() { updateDraft((next) => { const index = next.config.measurementBlocks.length; next.config.measurementBlocks.push({ id: crypto.randomUUID(), code: `measurement_block_${index + 1}`, name: "新尺寸块", applicableCategories: [next.category], enabled: true, sortOrder: index, fields: [] }); }); }
  function updateMeasurementBlock(index: number, key: keyof MeasurementBlock, value: string | boolean | number | GarmentCategory[]) { updateDraft((next) => { (next.config.measurementBlocks[index] as unknown as Record<string, unknown>)[key] = value; }); }
  function removeMeasurementBlock(index: number) { updateDraft((next) => { next.config.measurementBlocks.splice(index, 1); next.config.measurementBlocks.forEach((item, order) => { item.sortOrder = order; }); }); }
  function addMeasurementField(blockIndex: number) { updateDraft((next) => { const fields = next.config.measurementBlocks[blockIndex].fields; const index = fields.length; fields.push({ id: crypto.randomUUID(), code: `field_${index + 1}`, name: "新尺寸字段", standardUnit: "CM", min: 0, max: 200, step: 0.5, required: true, enabled: true, sortOrder: index }); }); }
  function updateMeasurementField(blockIndex: number, fieldIndex: number, key: keyof MeasurementFieldDefinition, value: string | boolean | number) { updateDraft((next) => { (next.config.measurementBlocks[blockIndex].fields[fieldIndex] as unknown as Record<string, unknown>)[key] = value; }); }
  function removeMeasurementField(blockIndex: number, fieldIndex: number) { updateDraft((next) => { const fields = next.config.measurementBlocks[blockIndex].fields; fields.splice(fieldIndex, 1); fields.forEach((item, order) => { item.sortOrder = order; }); }); }

  function newBinding() { const templateId = items.find((item) => item.status === "published")?.id ?? ""; setEditingBinding({ id: "", shopifyProductId: "", productTitle: "", productHandle: "", templateId, publishedVersion: null, enabled: true }); void loadBindingVersions(templateId); }
  function editBinding(binding: ProductBindingView) { setEditingBinding(clone(binding)); void loadBindingVersions(binding.templateId); }
  async function saveBinding() { if (!editingBinding) return; await run(async () => { await apiJson(editingBinding.id ? `/api/products/${editingBinding.id}` : "/api/products", jsonRequest(editingBinding.id ? "PUT" : "POST", editingBinding)); setEditingBinding(null); await loadBindings(); }, editingBinding.id ? "商品绑定已更新" : "商品绑定已创建"); }
  async function removeBinding(binding: ProductBindingView) { if (!confirm(`确认解除“${binding.productTitle}”的模板绑定？`)) return; await run(async () => { await apiJson(`/api/products/${binding.id}`, { method: "DELETE" }); await loadBindings(); }, "商品绑定已删除"); }

  function navigate(next: AdminView) { setView(next); setNotice(null); if (next === "products") void loadBindings(); }
  function openTab(next: TemplateTab) { setTab(next); if (next === "versions") void loadVersions(); }

  return <AdminShell view={view} onNavigate={navigate}>
    {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
    {view === "templates" && <TemplateWorkspace
      items={items} filtered={filtered} draft={draft} selected={selected} published={published} bindings={bindings} search={search} tab={tab} versions={versions} busy={busy}
      onSearch={setSearch} onChoose={choose} onCreate={() => create()} onCopy={() => draft && create(draft)} onDelete={removeTemplate} onSave={() => save()} onPublish={() => save(true)} onTab={openTab}
      onDraft={updateDraft} onTemplateType={setTemplateType}
      onAddComponent={addComponent} onUpdateComponent={updateComponent} onRemoveComponent={removeComponent}
      onAddStep={addStep} onUpdateStep={updateStep} onRemoveStep={removeStep} onAddOption={addOption} onUpdateOption={updateOption} onRemoveOption={removeOption}
      onAddBlock={addMeasurementBlock} onUpdateBlock={updateMeasurementBlock} onRemoveBlock={removeMeasurementBlock} onAddField={addMeasurementField} onUpdateField={updateMeasurementField} onRemoveField={removeMeasurementField}
    />}
    {view === "products" && <ProductBindings items={items} bindings={bindings} editing={editingBinding} versions={bindingVersions} onNew={newBinding} onEdit={editBinding} onRemove={removeBinding} onChange={(binding) => setEditingBinding(binding)} onTemplateChange={(templateId) => { if (!editingBinding) return; setEditingBinding({ ...editingBinding, templateId, publishedVersion: null }); void loadBindingVersions(templateId); }} onCancel={() => setEditingBinding(null)} onSave={saveBinding} />}
  </AdminShell>;
}

type TemplateWorkspaceProps = {
  items: TemplateView[]; filtered: TemplateView[]; draft: TemplateView | null; selected: string; published: number; bindings: ProductBindingView[]; search: string; tab: TemplateTab; versions: TemplateVersionView[]; busy: boolean;
  onSearch: (value: string) => void; onChoose: (item: TemplateView) => void; onCreate: () => void; onCopy: () => void; onDelete: () => void; onSave: () => void; onPublish: () => void; onTab: (tab: TemplateTab) => void;
  onDraft: (update: (draft: TemplateView) => void) => void; onTemplateType: (type: TemplateType) => void;
  onAddComponent: () => void; onUpdateComponent: (index: number, key: keyof GarmentComponentDefinition, value: string | boolean | number) => void; onRemoveComponent: (index: number) => void;
  onAddStep: () => void; onUpdateStep: (index: number, key: keyof CustomizationStep, value: string | boolean | number) => void; onRemoveStep: (index: number) => void;
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
        {props.tab === "base" && <BaseTab draft={draft} onDraft={props.onDraft} onTemplateType={props.onTemplateType}/>}
        {props.tab === "components" && <ComponentsTab draft={draft} items={props.items} onAdd={props.onAddComponent} onUpdate={props.onUpdateComponent} onRemove={props.onRemoveComponent}/>}
        {props.tab === "steps" && <StepsTab draft={draft} onAdd={props.onAddStep} onUpdate={props.onUpdateStep} onRemove={props.onRemoveStep} onAddOption={props.onAddOption} onUpdateOption={props.onUpdateOption} onRemoveOption={props.onRemoveOption}/>}
        {props.tab === "measurements" && <MeasurementsTab draft={draft} onAddBlock={props.onAddBlock} onUpdateBlock={props.onUpdateBlock} onRemoveBlock={props.onRemoveBlock} onAddField={props.onAddField} onUpdateField={props.onUpdateField} onRemoveField={props.onRemoveField}/>}
        {props.tab === "versions" && <VersionsTab versions={props.versions}/>}
        {props.tab === "json" && <><Section title="Schema v2 发布快照"/><pre className="json">{JSON.stringify(draft.config, null, 2)}</pre></>}
      </div>}</section>
    </div>
  </>;
}

function BaseTab({ draft, onDraft, onTemplateType }: { draft: TemplateView; onDraft: TemplateWorkspaceProps["onDraft"]; onTemplateType: (type: TemplateType) => void }) {
  return <div className="form form-section"><Field label="模板名称"><input value={draft.name} onChange={(event) => onDraft((next) => { next.name = event.target.value; })}/></Field><Field label="模板编码"><input value={draft.code} onChange={(event) => onDraft((next) => { next.code = event.target.value; })}/></Field><Field label="模板类型"><select value={draft.config.templateType} onChange={(event) => onTemplateType(event.target.value as TemplateType)}><option value="single">单品模板</option><option value="composite">组合/套装模板</option></select></Field><Field label="适用品类"><select value={draft.category} disabled={draft.config.templateType === "composite"} onChange={(event) => onDraft((next) => { next.category = event.target.value as GarmentCategory; })}>{categories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="前台按钮文字"><input value={draft.config.buttonLabel} onChange={(event) => onDraft((next) => { next.config.buttonLabel = event.target.value; })}/></Field><Field label="价格规则"><input value="所有定制项不影响价格" disabled/></Field></div>;
}

function ComponentsTab({ draft, items, onAdd, onUpdate, onRemove }: { draft: TemplateView; items: TemplateView[]; onAdd: () => void; onUpdate: TemplateWorkspaceProps["onUpdateComponent"]; onRemove: (index: number) => void }) {
  if (draft.config.templateType !== "composite") return <div className="empty">单品模板不包含组合/套装配置。</div>;
  const childTemplates = items.filter((item) => item.id !== draft.id && item.status === "published" && item.config.templateType === "single");
  return <><Section title="固定逻辑组件" action={<button className="secondary" onClick={onAdd}>＋ 添加组件</button>}/><p className="section-help">上衣、西裤和马甲是生产逻辑组件，不是 Shopify 独立商品；消费者不能增删。</p><div className="steps">{sortByOrder(draft.config.components).map((component, index) => <div className="step" key={component.id}><div className="component-grid"><Field label="组件名称"><input value={component.name} onChange={(event) => onUpdate(index, "name", event.target.value)}/></Field><Field label="组件编码"><input value={component.code} onChange={(event) => onUpdate(index, "code", event.target.value)}/></Field><Field label="组件品类"><select value={component.category} onChange={(event) => onUpdate(index, "category", event.target.value)}>{categories.filter(([value]) => value !== "suit").map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="子定制模板"><select value={component.childTemplateId} onChange={(event) => onUpdate(index, "childTemplateId", event.target.value)}><option value="">请选择已发布单品模板</option>{childTemplates.filter((item) => item.category === component.category).map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></Field><Field label="排序"><input type="number" min="0" value={component.sortOrder} onChange={(event) => onUpdate(index, "sortOrder", Number(event.target.value))}/></Field></div><div className="row-actions"><label><input type="checkbox" checked={component.customizationEnabled} onChange={(event) => onUpdate(index, "customizationEnabled", event.target.checked)}/> 启用定制</label><label><input type="checkbox" checked={component.required} onChange={(event) => onUpdate(index, "required", event.target.checked)}/> 必需组件</label><button className="delete" onClick={() => onRemove(index)}>删除组件</button></div></div>)}{!draft.config.components.length && <div className="empty">暂无逻辑组件。</div>}</div></>;
}

function StepsTab({ draft, onAdd, onUpdate, onRemove, onAddOption, onUpdateOption, onRemoveOption }: { draft: TemplateView; onAdd: () => void; onUpdate: TemplateWorkspaceProps["onUpdateStep"]; onRemove: (index: number) => void; onAddOption: (index: number) => void; onUpdateOption: TemplateWorkspaceProps["onUpdateOption"]; onRemoveOption: (step: number, option: number) => void }) {
  return <><Section title="定制步骤" action={<button className="secondary" onClick={onAdd}>＋ 添加步骤</button>}/><div className="steps">{sortByOrder(draft.config.steps).map((step, index) => <div className="step" key={step.id}><div className="step-row"><span className="num">{index + 1}</span><input value={step.title} aria-label="步骤名称" onChange={(event) => onUpdate(index, "title", event.target.value)}/><select value={step.type} aria-label="步骤类型" onChange={(event) => onUpdate(index, "type", event.target.value)}>{stepTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button className="delete" onClick={() => onRemove(index)}>删除</button></div><div className="form compact-form"><Field label="步骤编码"><input value={step.code} onChange={(event) => onUpdate(index, "code", event.target.value)}/></Field><Field label="展示方式"><select value={step.displayType ?? "radio"} disabled={step.type !== "options"} onChange={(event) => onUpdate(index, "displayType", event.target.value)}>{displayTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="步骤说明"><input value={step.description ?? ""} onChange={(event) => onUpdate(index, "description", event.target.value)}/></Field><Field label="排序"><input type="number" min="0" value={step.sortOrder} onChange={(event) => onUpdate(index, "sortOrder", Number(event.target.value))}/></Field><Field label="状态"><span className="check-row"><label><input type="checkbox" checked={step.enabled} onChange={(event) => onUpdate(index, "enabled", event.target.checked)}/> 启用</label><label><input type="checkbox" checked={step.required} onChange={(event) => onUpdate(index, "required", event.target.checked)}/> 必填</label></span></Field></div>{step.type === "options" && <div className="choice-editor"><div className="choice-head"><strong>候选选项</strong><button className="secondary" onClick={() => onAddOption(index)}>＋ 添加选项</button></div>{sortByOrder(step.options).map((option, optionIndex) => <div className="option-card" key={option.id}><div className="choice-row"><input value={option.name} aria-label="选项名称" placeholder="显示名称" onChange={(event) => onUpdateOption(index, optionIndex, "name", event.target.value)}/><input value={option.code} aria-label="选项编码" placeholder="稳定编码" onChange={(event) => onUpdateOption(index, optionIndex, "code", event.target.value)}/><input value={option.description ?? ""} aria-label="选项说明" placeholder="选项说明（可选）" onChange={(event) => onUpdateOption(index, optionIndex, "description", event.target.value)}/><input value={option.imageUrl ?? ""} aria-label="选项图片" placeholder="图片 URL（可选）" onChange={(event) => onUpdateOption(index, optionIndex, "imageUrl", event.target.value)}/><button className="delete" onClick={() => onRemoveOption(index, optionIndex)}>删除</button></div><div className="row-actions"><label><input type="checkbox" checked={option.enabled} onChange={(event) => onUpdateOption(index, optionIndex, "enabled", event.target.checked)}/> 启用</label><label><input type="checkbox" checked={option.defaultSelected} onChange={(event) => onUpdateOption(index, optionIndex, "defaultSelected", event.target.checked)}/> 默认选中</label><label>排序 <input className="inline-number" type="number" min="0" value={option.sortOrder} onChange={(event) => onUpdateOption(index, optionIndex, "sortOrder", Number(event.target.value))}/></label><span>适用品类：{option.applicableCategories.map((category) => garmentCategoryLabels[category]).join("、") || "未设置"}</span><span className="fixed-rule">不影响价格</span></div></div>)}{!step.options.length && <p className="choice-empty">暂无候选选项。</p>}</div>}</div>)}{!draft.config.steps.length && <div className="empty">暂无定制步骤。</div>}</div></>;
}

function MeasurementsTab({ draft, onAddBlock, onUpdateBlock, onRemoveBlock, onAddField, onUpdateField, onRemoveField }: { draft: TemplateView; onAddBlock: () => void; onUpdateBlock: TemplateWorkspaceProps["onUpdateBlock"]; onRemoveBlock: (index: number) => void; onAddField: (index: number) => void; onUpdateField: TemplateWorkspaceProps["onUpdateField"]; onRemoveField: (block: number, field: number) => void }) {
  return <><Section title="尺寸块与字段" action={<button className="secondary" onClick={onAddBlock}>＋ 添加尺寸块</button>}/><div className="steps">{sortByOrder(draft.config.measurementBlocks).map((block, blockIndex) => <div className="step measurement-block" key={block.id}><div className="block-head"><strong>{block.name}</strong><button className="delete" onClick={() => onRemoveBlock(blockIndex)}>删除尺寸块</button></div><div className="form compact-form"><Field label="尺寸块名称"><input value={block.name} onChange={(event) => onUpdateBlock(blockIndex, "name", event.target.value)}/></Field><Field label="尺寸块编码"><input value={block.code} onChange={(event) => onUpdateBlock(blockIndex, "code", event.target.value)}/></Field><Field label="说明"><input value={block.description ?? ""} onChange={(event) => onUpdateBlock(blockIndex, "description", event.target.value)}/></Field><Field label="状态"><label><input type="checkbox" checked={block.enabled} onChange={(event) => onUpdateBlock(blockIndex, "enabled", event.target.checked)}/> 启用尺寸块</label></Field></div><div className="choice-head"><strong>尺寸字段</strong><button className="secondary" onClick={() => onAddField(blockIndex)}>＋ 添加字段</button></div><div className="measurements-table"><div className="measurement-labels"><span>名称</span><span>编码</span><span>单位</span><span>最小</span><span>最大</span><span>步长</span><span>状态</span><span/></div>{sortByOrder(block.fields).map((field, fieldIndex) => <div className="measure-row" key={field.id}><input value={field.name} aria-label="字段名称" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "name", event.target.value)}/><input value={field.code} aria-label="字段编码" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "code", event.target.value)}/><select value={field.standardUnit} aria-label="标准单位" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "standardUnit", event.target.value)}><option>CM</option><option>IN</option><option>KG</option></select><input type="number" value={field.min} aria-label="最小值" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "min", Number(event.target.value))}/><input type="number" value={field.max} aria-label="最大值" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "max", Number(event.target.value))}/><input type="number" step="0.1" value={field.step} aria-label="步长" onChange={(event) => onUpdateField(blockIndex, fieldIndex, "step", Number(event.target.value))}/><label className="compact-check"><input type="checkbox" checked={field.enabled} onChange={(event) => onUpdateField(blockIndex, fieldIndex, "enabled", event.target.checked)}/> 启用</label><button className="delete" onClick={() => onRemoveField(blockIndex, fieldIndex)}>删除</button></div>)}{!block.fields.length && <p className="choice-empty">暂无尺寸字段。</p>}</div></div>)}{!draft.config.measurementBlocks.length && <div className="empty">暂无尺寸块。</div>}</div></>;
}

function VersionsTab({ versions }: { versions: TemplateVersionView[] }) { return <><Section title="不可变发布记录"/><div className="table-wrap embedded-table"><table><thead><tr><th>版本</th><th>Schema</th><th>步骤</th><th>逻辑组件</th><th>尺寸块</th><th>发布时间</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>v{version.version}</strong></td><td>v{version.schemaVersion}</td><td>{version.config.steps.length}</td><td>{version.config.components.length}</td><td>{version.config.measurementBlocks.length}</td><td>{new Date(version.publishedAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table>{!versions.length && <div className="empty">暂无发布记录</div>}</div></>;
}

function ProductBindings({ items, bindings, editing, versions, onNew, onEdit, onRemove, onChange, onTemplateChange, onCancel, onSave }: { items: TemplateView[]; bindings: ProductBindingView[]; editing: ProductBindingView | null; versions: TemplateVersionView[]; onNew: () => void; onEdit: (binding: ProductBindingView) => void; onRemove: (binding: ProductBindingView) => void; onChange: (binding: ProductBindingView) => void; onTemplateChange: (templateId: string) => void; onCancel: () => void; onSave: () => void }) {
  const publishedTemplates = items.filter((item) => item.status === "published");
  return <><div className="head"><div><h2>商品绑定</h2><p>将普通 Shopify 商品绑定到指定的已发布模板版本。</p></div><button className="primary" onClick={onNew}>＋ 新建绑定</button></div>{editing && <div className="panel binding-form"><div className="form"><Field label="Shopify Product ID"><input value={editing.shopifyProductId} onChange={(event) => onChange({ ...editing, shopifyProductId: event.target.value })}/></Field><Field label="商品标题"><input value={editing.productTitle} onChange={(event) => onChange({ ...editing, productTitle: event.target.value })}/></Field><Field label="Handle"><input value={editing.productHandle} onChange={(event) => onChange({ ...editing, productHandle: event.target.value })}/></Field><Field label="配置模板"><select value={editing.templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">请选择已发布模板</option>{publishedTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.categoryLabel}</option>)}</select></Field><Field label="发布版本"><select value={editing.publishedVersion ?? ""} onChange={(event) => onChange({ ...editing, publishedVersion: event.target.value ? Number(event.target.value) : null })}><option value="">跟随最新发布版本</option>{versions.map((version) => <option key={version.id} value={version.version}>v{version.version}</option>)}</select></Field><Field label="定制能力"><label className="switch-label"><input type="checkbox" checked={editing.enabled} onChange={(event) => onChange({ ...editing, enabled: event.target.checked })}/> 启用商品定制</label></Field></div><div className="actions"><button className="secondary" onClick={onCancel}>取消</button><button className="primary" onClick={onSave}>保存绑定</button></div></div>}<div className="panel table-wrap"><table><thead><tr><th>商品</th><th>Product ID</th><th>模板</th><th>版本</th><th>状态</th><th>操作</th></tr></thead><tbody>{bindings.map((binding) => <tr key={binding.id}><td><strong>{binding.productTitle}</strong><small>{binding.productHandle}</small></td><td>{binding.shopifyProductId}</td><td>{items.find((item) => item.id === binding.templateId)?.name ?? binding.templateId}</td><td>{binding.publishedVersion ? `v${binding.publishedVersion}` : "最新"}</td><td><span className={`badge ${binding.enabled ? "published" : "draft"}`}>{binding.enabled ? "已启用" : "已停用"}</span></td><td><button className="link" onClick={() => onEdit(binding)}>编辑</button><button className="link danger-text" onClick={() => onRemove(binding)}>删除</button></td></tr>)}</tbody></table>{!bindings.length && <div className="empty">暂无商品绑定</div>}</div></>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="field"><label>{label}</label>{children}</div>; }
function Section({ title, action }: { title: string; action?: React.ReactNode }) { return <div className="section-title"><h4>{title}</h4>{action}</div>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div>; }
