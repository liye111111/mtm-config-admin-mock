"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, type ReactNode } from "react";
import { createUniqueCode, DEFAULT_EMBROIDERY_CONFIG, type CustomizationStep, type CustomizationOption, type OptionGroup, type DisplayStyle, type EmbroideryChoice, type EmbroideryConfig, type TextInputConfig } from "@/src/domain";
import { ensureComponentsStep } from "@/src/domain/composite-flow";
import type { MaterialPreviewProduct, ProductBindingView, TemplateView } from "./types";
import { ImageField, ImagePickerPendingContext } from "./image-field";
import { apiJson } from "./api";

const stepTypes: Array<[CustomizationStep["type"], string]> = [["material", "材质 SKU"], ["options", "选项步骤"], ["embroidery", "刺绣定制"], ["components", "组合/套装"], ["measurements", "量体尺寸"], ["review", "配置确认"]];
const styles: Array<[DisplayStyle, string]> = [["image_text", "图文"], ["text", "文本"], ["icon_text", "图标＋文本"]];
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="mtm-editor-field"><span>{label}</span>{children}</label>; }
function ordered<T extends { sortOrder: number }>(items: T[]) { return [...items].sort((a, b) => a.sortOrder - b.sortOrder); }
function move<T extends { id: string; sortOrder: number }>(items: T[], id: string, delta: number) {
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  const index = items.findIndex((item) => item.id === id), target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return;
  const [item] = items.splice(index, 1); items.splice(target, 0, item);
  items.forEach((item, position) => { item.sortOrder = position; });
}
function OrderButtons({ index, count, onMove }: { index: number; count: number; onMove: (delta: number) => void }) {
  return <><button type="button" className="link" disabled={index === 0} onClick={() => onMove(-1)} aria-label="上移">↑ 上移</button><button type="button" className="link" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="下移">↓ 下移</button></>;
}

export function TemplateSteps({ draft, bindings, disabled, onDraft, onImagePending }: {
  draft: TemplateView; bindings: ProductBindingView[]; disabled: boolean; onDraft: (update: (draft: TemplateView) => void) => void; onImagePending: (pending: boolean) => void;
}) {
  const [openSteps, setOpenSteps] = useState(() => new Set(draft.config.steps.map((step) => step.id)));
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [draggingLayer, setDraggingLayer] = useState<string | null>(null);
  function toggle(setter: typeof setOpenSteps, id: string) { setter((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function expand(setter: typeof setOpenSteps, id: string) { setter((current) => new Set(current).add(id)); }
  // 异步选图回填使用稳定 ID 定位；删除、移动或切换模板后不能写入其他对象。
  const update = (operation: (next: TemplateView) => void) => onDraft((next) => { if (next.id === draft.id) operation(next); });
  const stepChange = (id: string, operation: (step: CustomizationStep) => void) => update((next) => { const step = next.config.steps.find((item) => item.id === id); if (step) operation(step); });
  const groupChange = (id: string, operation: (group: OptionGroup) => void) => update((next) => { const group = next.config.steps.flatMap((step) => step.optionGroups).find((item) => item.id === id); if (group) operation(group); });
  const optionChange = (groupId: string, id: string, operation: (option: CustomizationOption) => void) => groupChange(groupId, (group) => { const option = group.options.find((item) => item.id === id); if (option) operation(option); });
  function addStep() {
    const id = crypto.randomUUID();
    update((next) => next.config.steps.push({ id, code: createUniqueCode("step"), title: "新步骤", type: "options", required: true, enabled: true, sortOrder: Math.max(-1, ...next.config.steps.map((step) => step.sortOrder)) + 1, optionGroups: [] }));
    expand(setOpenSteps, id);
  }
  function moveStep(id: string, delta: number) {
    update((next) => {
      move(next.config.steps, id, delta);
      const material = next.config.steps.find((step) => step.enabled && step.type === "material");
      if (!material) return;
      next.config.steps.sort((left, right) => left.sortOrder - right.sortOrder);
      next.config.steps = [material, ...next.config.steps.filter((step) => step.id !== material.id)];
      next.config.steps.forEach((step, index) => { step.sortOrder = index; });
    });
  }
  function addGroup(stepId: string) {
    const code = createUniqueCode("group");
    const id = crypto.randomUUID();
    const previewLayerOrder = Math.max(-1, ...draft.config.steps.flatMap((step) => step.optionGroups).map((group) => group.previewLayerOrder)) + 1;
    stepChange(stepId, (step) => step.optionGroups.push({ id, code, title: "新选项组", displayStyle: "text", required: true, enabled: true, sortOrder: Math.max(-1, ...step.optionGroups.map((group) => group.sortOrder)) + 1, previewEnabled: false, previewLayerOrder, options: [createOption([])] }));
    expand(setOpenGroups, id);
  }
  function createOption(options: CustomizationOption[]): CustomizationOption {
    return { id: crypto.randomUUID(), code: createUniqueCode("option"), name: "新选项", sortOrder: Math.max(-1, ...options.map((option) => option.sortOrder)) + 1, enabled: true, defaultSelected: false, applicableCategories: [draft.category], affectsPrice: false };
  }
  function addOption(groupId: string) {
    groupChange(groupId, (group) => group.options.push(createOption(group.options)));
  }
  function changeStyle(groupId: string, style: DisplayStyle) {
    groupChange(groupId, (group) => {
      group.displayStyle = style;
      // 空组也应立即展示选图入口；素材始终属于选项，不增加组级图片。
      if (style !== "text" && !group.options.length) group.options.push(createOption([]));
    });
  }
  function changeType(step: CustomizationStep, type: CustomizationStep["type"]) {
    if (type === step.type) return;
    if ((step.optionGroups.length || step.embroidery) && !confirm("切换步骤类型将清除此步骤中的选项组或刺绣配置，是否继续？")) return;
    update((next) => {
      const item = next.config.steps.find((entry) => entry.id === step.id);
      if (!item) return;
      item.type = type; item.optionGroups = []; delete item.textInput; delete item.embroidery;
      if (type === "material") {
        item.title = item.title === "新步骤" ? "选择材质" : item.title;
        item.required = true;
        next.config.steps.sort((left, right) => left.sortOrder - right.sortOrder);
        next.config.steps = [item, ...next.config.steps.filter((entry) => entry.id !== item.id)];
        next.config.steps.forEach((entry, index) => { entry.sortOrder = index; });
      }
      if (type === "embroidery") {
        item.textInput = { minLength: 1, maxLength: 20, placeholder: "请输入刺绣文字", characterPolicy: "unicode_text" };
        item.embroidery = structuredClone(DEFAULT_EMBROIDERY_CONFIG);
        item.embroidery.positions.forEach((choice) => { choice.code = createUniqueCode("position"); });
        item.embroidery.fonts.forEach((choice) => { choice.code = createUniqueCode("font"); });
        item.embroidery.colors.forEach((choice) => { choice.code = createUniqueCode("color"); });
      }
    });
  }
  function relocate(groupId: string, targetId: string) {
    update((next) => {
      const source = next.config.steps.find((step) => step.optionGroups.some((group) => group.id === groupId));
      const target = next.config.steps.find((step) => step.id === targetId && step.type === "options");
      if (!source || !target || source.id === target.id) return;
      const index = source.optionGroups.findIndex((group) => group.id === groupId);
      const [group] = source.optionGroups.splice(index, 1);
      group.sortOrder = Math.max(-1, ...target.optionGroups.map((item) => item.sortOrder)) + 1;
      target.optionGroups.push(group);
    });
  }
  function togglePreview(groupId: string, enabled: boolean) {
    update((next) => {
      const groups = next.config.steps.flatMap((step) => step.optionGroups);
      const group = groups.find((item) => item.id === groupId);
      if (!group) return;
      group.previewEnabled = enabled;
      if (enabled) group.previewLayerOrder = Math.max(-1, ...groups.filter((item) => item.previewEnabled && item.id !== groupId).map((item) => item.previewLayerOrder)) + 1;
    });
  }
  function reorderPreview(targetId: string) {
    if (!draggingLayer || draggingLayer === targetId) return;
    update((next) => {
      const groups = next.config.steps.flatMap((step) => step.optionGroups).filter((group) => group.previewEnabled).sort((a, b) => a.previewLayerOrder - b.previewLayerOrder);
      const source = groups.findIndex((group) => group.id === draggingLayer), target = groups.findIndex((group) => group.id === targetId);
      if (source < 0 || target < 0) return;
      const [moved] = groups.splice(source, 1); groups.splice(target, 0, moved);
      groups.forEach((group, index) => { group.previewLayerOrder = index; });
    });
    setDraggingLayer(null);
  }
  const steps = ordered(draft.config.steps);
  return <ImagePickerPendingContext.Provider value={onImagePending}><fieldset className="mtm-step-editor" disabled={disabled}>
    <PreviewConfiguration draft={draft} bindings={bindings} onDraft={update} draggingLayer={draggingLayer} onDrag={setDraggingLayer} onDrop={reorderPreview}/>
    <div className="section-title"><h4>步骤 → 选项组 → 选项</h4><button type="button" className="secondary" onClick={addStep}>＋ 添加步骤</button></div>
    <p className="section-help">消费者一页一个步骤。步骤内可配置多个独立单选组；样式属于选项组，标签仅展示、不影响价格。</p>
    <p className="section-help">图片通过 Shopify 原生素材选择器管理。步骤默认大图可不填；图文／图标组的启用选项发布时必须有展示素材。</p>
    {draft.config.templateType === "composite" && <div className="section-help">
      <p>“组合/套装”步骤用于按顺序展开子模板的定制选项；可在其前后添加独立选项、量体尺寸和配置确认步骤。组合中的量体使用本模板的“量体定义”，不重复使用子模板的量体步骤。</p>
      {!steps.some((step) => step.type === "components" && step.enabled) && <><p role="alert">缺少启用的组合入口，不影响继续编辑独立步骤；发布前请补齐。</p><button type="button" className="secondary" onClick={() => update((next) => ensureComponentsStep(next.config))}>补齐组合步骤</button></>}
      {steps.filter((step) => step.type === "components" && step.enabled).length > 1 && <p role="alert">有多个启用的组合入口，请只保留一个，避免重复展开子模板；其他类型步骤可以保留。</p>}
    </div>}
    {!steps.length && <div className="empty">暂无步骤，请添加。</div>}
    {steps.map((step, stepIndex) => <section className={`mtm-step-card${openSteps.has(step.id) ? "" : " is-collapsed"}`} key={step.id}>
      <div className="mtm-editor-heading mtm-collapsible-heading"><div className="mtm-editor-title"><button type="button" className="mtm-collapse-toggle" aria-expanded={openSteps.has(step.id)} aria-label={`${openSteps.has(step.id) ? "收起" : "展开"}步骤 ${step.title}`} onClick={() => toggle(setOpenSteps, step.id)}>{openSteps.has(step.id) ? "▾" : "▸"}</button><span><strong>步骤 {stepIndex + 1} · {step.title}</strong><small>{stepTypes.find(([type]) => type === step.type)?.[1]} · {step.enabled ? "启用" : "停用"}{step.type === "options" ? ` · ${step.optionGroups.length} 个选项组` : ""}</small></span></div><div className="actions"><OrderButtons index={stepIndex} count={steps.length} onMove={(delta) => moveStep(step.id, delta)}/><button type="button" className="link danger-text" onClick={() => { if (confirm(`删除步骤“${step.title}”及其选项组？`)) update((next) => { next.config.steps = next.config.steps.filter((item) => item.id !== step.id); }); }}>删除步骤</button></div></div>
      <div className="mtm-editor-grid">
        <Field label="步骤名称"><input value={step.title} onChange={(event) => stepChange(step.id, (item) => { item.title = event.target.value; })}/></Field>
        <Field label="步骤编码"><input value={step.code} onChange={(event) => stepChange(step.id, (item) => { item.code = event.target.value; })}/></Field>
        <Field label="步骤类型"><select value={step.type} onChange={(event) => changeType(step, event.target.value as CustomizationStep["type"])}>{stepTypes.filter(([type]) => (type !== "components" || draft.config.templateType === "composite") && (type !== "material" || step.type === "material" || !steps.some((entry) => entry.type === "material" && entry.enabled))).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></Field>
        <Field label="步骤说明"><input value={step.description ?? ""} onChange={(event) => stepChange(step.id, (item) => { item.description = event.target.value; })}/></Field>
      </div>
      <label className="check-row"><input type="checkbox" checked={step.enabled} onChange={(event) => stepChange(step.id, (item) => { item.enabled = event.target.checked; })}/>启用步骤</label>
      {step.type === "material" && <p className="section-help">材质来自绑定商品的 Shopify Variant/SKU，决定原价和库存状态；该步骤必须启用且位于第一步，不配置普通选项。</p>}
      {step.type === "embroidery" && <EmbroideryFields config={step.textInput} embroidery={step.embroidery} onTextChange={(textInput) => stepChange(step.id, (item) => { item.textInput = textInput; })} onEmbroideryChange={(embroidery) => stepChange(step.id, (item) => { item.embroidery = embroidery; })}/>}
      {step.type === "options" && <>
        <div className="mtm-editor-heading"><strong>选项组（{step.optionGroups.length}）</strong><button type="button" className="secondary" onClick={() => addGroup(step.id)}>＋ 添加选项组</button></div>
        {ordered(step.optionGroups).map((group, groupIndex) => <section className={`mtm-group-card${openGroups.has(group.id) ? "" : " is-collapsed"}`} key={group.id}>
          <div className="mtm-editor-heading mtm-collapsible-heading"><div className="mtm-editor-title"><button type="button" className="mtm-collapse-toggle" aria-expanded={openGroups.has(group.id)} aria-label={`${openGroups.has(group.id) ? "收起" : "展开"}选项组 ${group.title}`} onClick={() => toggle(setOpenGroups, group.id)}>{openGroups.has(group.id) ? "▾" : "▸"}</button><span><strong>{group.title}</strong><small>{styles.find(([style]) => style === group.displayStyle)?.[1]} · {group.enabled ? "启用" : "停用"} · {group.required ? "必选" : "可选"} · {group.options.length} 个选项</small></span></div><div className="actions"><OrderButtons index={groupIndex} count={step.optionGroups.length} onMove={(delta) => stepChange(step.id, (item) => move(item.optionGroups, group.id, delta))}/><button type="button" className="link danger-text" onClick={() => { if (confirm(`删除选项组“${group.title}”及其选项？`)) stepChange(step.id, (item) => { item.optionGroups = item.optionGroups.filter((entry) => entry.id !== group.id); }); }}>删除组</button></div></div>
          <div className="mtm-editor-grid">
            <Field label="组名称"><input value={group.title} onChange={(event) => groupChange(group.id, (item) => { item.title = event.target.value; })}/></Field>
            <Field label="组编码（模板内唯一）"><input value={group.code} onChange={(event) => groupChange(group.id, (item) => { item.code = event.target.value; })}/></Field>
            <Field label="统一展示样式"><select value={group.displayStyle} onChange={(event) => changeStyle(group.id, event.target.value as DisplayStyle)}>{styles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="所属步骤"><select value={step.id} onChange={(event) => relocate(group.id, event.target.value)}>{steps.filter((entry) => entry.type === "options").map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></Field>
            <Field label="组说明"><input value={group.description ?? ""} onChange={(event) => groupChange(group.id, (item) => { item.description = event.target.value; })}/></Field>
          </div>
          <div className="check-row"><label><input type="checkbox" checked={group.enabled} onChange={(event) => groupChange(group.id, (item) => { item.enabled = event.target.checked; })}/>启用组</label><label><input type="checkbox" checked={group.required} onChange={(event) => groupChange(group.id, (item) => { item.required = event.target.checked; })}/>必选</label><label><input type="checkbox" checked={group.previewEnabled} onChange={(event) => togglePreview(group.id, event.target.checked)}/>参与合图</label></div>
          <div className="mtm-editor-heading"><span>候选选项</span><button type="button" className="secondary" onClick={() => addOption(group.id)}>＋ 添加选项</button></div>
          {group.displayStyle !== "text" && <p className="section-help">{group.displayStyle === "icon_text" ? "请在每个选项下选择图标素材" : "请在每个选项下选择展示图片"}，同组样式统一，素材分别配置。</p>}
          {ordered(group.options).map((option, optionIndex) => <div className="mtm-option-card" key={option.id}>
            <div className="mtm-editor-heading"><strong>{option.name}</strong><div className="actions"><OrderButtons index={optionIndex} count={group.options.length} onMove={(delta) => groupChange(group.id, (item) => move(item.options, option.id, delta))}/><button type="button" className="link danger-text" onClick={() => { if (confirm(`删除选项“${option.name}”？`)) groupChange(group.id, (item) => { item.options = item.options.filter((entry) => entry.id !== option.id); }); }}>删除选项</button></div></div>
            <div className="mtm-editor-grid">
              <Field label="选项名称"><input value={option.name} onChange={(event) => optionChange(group.id, option.id, (item) => { item.name = event.target.value; })}/></Field>
              <Field label="选项编码"><input value={option.code} onChange={(event) => optionChange(group.id, option.id, (item) => { item.code = event.target.value; })}/></Field>
              <Field label="选项说明"><textarea rows={2} value={option.description ?? ""} onChange={(event) => optionChange(group.id, option.id, (item) => { item.description = event.target.value; })}/></Field>
              <Field label="标签文本（留空不显示）"><input maxLength={80} placeholder="例如：10% Sale（仅展示）" value={option.badge?.text ?? ""} onChange={(event) => optionChange(group.id, option.id, (item) => { item.badge = event.target.value ? { type: "discount", text: event.target.value } : undefined; })}/></Field>
              <Field label="标签类型"><select value={option.badge?.type ?? "discount"} onChange={() => undefined}><option value="discount">折扣（仅展示）</option></select></Field>
            </div>
            <div className="check-row"><label><input type="checkbox" checked={option.enabled} onChange={(event) => optionChange(group.id, option.id, (item) => { item.enabled = event.target.checked; if (!item.enabled) item.defaultSelected = false; })}/>启用选项</label><label><input type="checkbox" checked={option.defaultSelected} disabled={!option.enabled} onChange={(event) => groupChange(group.id, (item) => { item.options.forEach((entry) => { if (entry.id === option.id) entry.defaultSelected = event.target.checked; else if (event.target.checked) entry.defaultSelected = false; }); })}/>默认选中</label><span className="fixed-rule">不影响价格</span></div>
            <div className="mtm-editor-grid">
              {group.displayStyle !== "text" && <ImageField label={group.displayStyle === "icon_text" ? "选项图标" : "选项展示图片"} required={option.enabled && group.enabled && step.enabled} image={option.displayImage} onChange={(image) => optionChange(group.id, option.id, (item) => { item.displayImage = image; })}/>}
              {draft.config.previewMode === "layered" && group.previewEnabled && <div><label className="check-row"><input type="checkbox" checked={option.previewLayer?.type === "empty"} onChange={(event) => optionChange(group.id, option.id, (item) => { item.previewLayer = event.target.checked ? { type: "empty" } : undefined; })}/>无视觉变化</label>{option.previewLayer?.type !== "empty" && <ImageField label="透明合图图层" required={option.enabled && group.enabled && step.enabled} image={option.previewLayer?.type === "image" ? option.previewLayer.image : undefined} onChange={(image) => optionChange(group.id, option.id, (item) => { item.previewLayer = image ? { type: "image", image } : undefined; })}/>}</div>}
            </div>
          </div>)}
          {!group.options.length && <p className="section-help">暂无选项，请点击“＋ 添加选项”配置文字及图片；空组不会在消费者端显示。</p>}
        </section>)}
      </>}
    </section>)}
  </fieldset></ImagePickerPendingContext.Provider>;
}

function EmbroideryFields({ config, embroidery, onTextChange, onEmbroideryChange }: { config?: TextInputConfig; embroidery?: EmbroideryConfig; onTextChange: (config: TextInputConfig) => void; onEmbroideryChange: (config: EmbroideryConfig) => void }) {
  const value = config ?? { minLength: 1, maxLength: 20, characterPolicy: "unicode_text" as const };
  const dictionaries = embroidery ?? structuredClone(DEFAULT_EMBROIDERY_CONFIG);
  return <div>
    <div className="mtm-editor-heading"><strong>刺绣文字规则</strong></div>
    <div className="mtm-editor-grid">
      <Field label="最小字符数"><input type="number" min={0} max={200} value={value.minLength} onChange={(event) => onTextChange({ ...value, minLength: Number(event.target.value) })}/></Field>
      <Field label="最大字符数"><input type="number" min={1} max={200} value={value.maxLength} onChange={(event) => onTextChange({ ...value, maxLength: Number(event.target.value) })}/></Field>
      <Field label="占位文案"><input value={value.placeholder ?? ""} onChange={(event) => onTextChange({ ...value, placeholder: event.target.value })}/></Field>
      <Field label="字符规则"><select value={value.characterPolicy} onChange={(event) => onTextChange({ ...value, characterPolicy: event.target.value as TextInputConfig["characterPolicy"] })}><option value="unicode_text">全部 Unicode（含 emoji）</option><option value="letters_numbers_spaces">英文、数字和空格</option><option value="letters_only">仅英文字母</option></select></Field>
    </div>
    <div className="mtm-editor-heading"><strong>位置、字体和颜色选项</strong></div>
    <p className="section-help">三类选项均为可选配置；消费者端只显示有配置的类型。编码用于保存订单数据，发布后请勿随意修改。</p>
    <div className="mtm-embroidery-choice-list">
      <EmbroideryChoiceEditor label="刺绣位置" prefix="position" choices={dictionaries.positions} onChange={(positions) => onEmbroideryChange({ ...dictionaries, positions })}/>
      <EmbroideryChoiceEditor label="刺绣字体" prefix="font" choices={dictionaries.fonts} showDescription onChange={(fonts) => onEmbroideryChange({ ...dictionaries, fonts })}/>
      <EmbroideryChoiceEditor label="刺绣颜色" prefix="color" choices={dictionaries.colors} onChange={(colors) => onEmbroideryChange({ ...dictionaries, colors })}/>
    </div>
  </div>;
}

function EmbroideryChoiceEditor({ label, prefix, choices, showDescription = false, onChange }: { label: string; prefix: string; choices: EmbroideryChoice[]; showDescription?: boolean; onChange: (choices: EmbroideryChoice[]) => void }) {
  const update = (index: number, change: Partial<EmbroideryChoice>) => onChange(choices.map((choice, position) => position === index ? { ...choice, ...change } : choice));
  const relocate = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= choices.length) return;
    const next = [...choices], [choice] = next.splice(index, 1);
    next.splice(target, 0, choice);
    onChange(next);
  };
  return <section className="mtm-group-card">
    <div className="mtm-editor-heading"><strong>{label}（{choices.length}）</strong><button type="button" className="secondary" onClick={() => onChange([...choices, { code: createUniqueCode(prefix), name: "新选项" }])}>＋ 添加</button></div>
    {choices.map((choice, index) => <div className="mtm-option-card" key={index}>
      <div className="mtm-editor-grid">
        <Field label="选项名称"><input value={choice.name} onChange={(event) => update(index, { name: event.target.value })}/></Field>
        <Field label="选项编码"><input value={choice.code} onChange={(event) => update(index, { code: event.target.value })}/></Field>
        {showDescription && <Field label="字体说明（留空不显示）"><textarea rows={2} maxLength={200} value={choice.description ?? ""} onChange={(event) => update(index, { description: event.target.value || undefined })}/></Field>}
      </div>
      <div className="actions"><button type="button" className="link" disabled={index === 0} onClick={() => relocate(index, -1)}>↑ 上移</button><button type="button" className="link" disabled={index === choices.length - 1} onClick={() => relocate(index, 1)}>↓ 下移</button><button type="button" className="link danger-text" onClick={() => onChange(choices.filter((_, position) => position !== index))}>删除</button></div>
    </div>)}
    {!choices.length && <p className="section-help">未配置，消费者端不会显示此项。</p>}
  </section>;
}

function PreviewConfiguration({ draft, bindings, onDraft, draggingLayer, onDrag, onDrop }: {
  draft: TemplateView;
  bindings: ProductBindingView[];
  onDraft: (operation: (draft: TemplateView) => void) => void;
  draggingLayer: string | null;
  onDrag: (id: string | null) => void;
  onDrop: (id: string) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const groups = draft.config.steps.flatMap((step) => step.optionGroups).filter((group) => group.previewEnabled).sort((a, b) => a.previewLayerOrder - b.previewLayerOrder);
  const selectedLayers = groups.flatMap((group) => {
    const selectedId = choices[group.id] ?? group.options.find((option) => option.enabled && option.defaultSelected)?.id;
    const option = group.options.find((item) => item.id === selectedId && item.enabled);
    return option?.previewLayer?.type === "image" ? [{ group, option, image: option.previewLayer.image }] : [];
  });
  const setMode = (mode: "none" | "layered") => onDraft((next) => { next.config.previewMode = mode; });
  return <section className="mtm-preview-config">
    <div className="section-title"><h4>模板预览</h4></div>
    <p className="section-help">预览属于单品模板并跨步骤累计。步骤只组织操作流程，不影响图层顺序。</p>
    <Field label="预览模式"><select value={draft.config.previewMode} onChange={(event) => setMode(event.target.value as "none" | "layered")}><option value="none">固定展示图</option><option value="layered">分层合图</option></select></Field>
    {draft.config.previewMode === "none" ? <>
      <ImageField label="模板固定展示图" image={draft.config.previewDisplayImage} onChange={(image) => onDraft((next) => { next.config.previewDisplayImage = image; })}/>
      <p className="section-help">未配置时，消费者端回退 Shopify 商品图。</p>
    </> : <>
      <p className="section-help mtm-preview-mode-help">合图底图由 Shopify 材质 SKU 的上衣／裤子底图元字段提供，模板只配置叠加图层。</p>
      <div className="mtm-layer-layout">
        <div><strong>合图层顺序</strong>{groups.length ? groups.map((group) => <div key={group.id} draggable className={`mtm-layer-row${draggingLayer === group.id ? " dragging" : ""}`} onDragStart={() => onDrag(group.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(group.id)} onDragEnd={() => onDrag(null)}><span aria-hidden="true">⋮⋮</span><strong>{group.title}</strong><small>{group.code}</small></div>) : <p className="section-help">请在下方选项组中开启“参与合图”。</p>}</div>
        <div><strong>合图预览</strong>{groups.map((group) => <Field key={group.id} label={group.title}><select value={choices[group.id] ?? group.options.find((option) => option.enabled && option.defaultSelected)?.id ?? ""} onChange={(event) => setChoices((current) => ({ ...current, [group.id]: event.target.value }))}><option value="">不选择</option>{ordered(group.options).filter((option) => option.enabled).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></Field>)}</div>
      </div>
      <MaterialSkuPreview draft={draft} bindings={bindings} layers={selectedLayers.map(({ group, option, image }) => ({ key: `${group.id}:${option.id}`, name: `${group.title}：${option.name}`, url: image.url }))}/>
    </>}
  </section>;
}

function MaterialSkuPreview({ draft, bindings, layers }: { draft: TemplateView; bindings: ProductBindingView[]; layers: Array<{ key: string; name: string; url: string }> }) {
  const [bindingId, setBindingId] = useState(bindings[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [result, setResult] = useState<{ bindingId: string; product?: MaterialPreviewProduct; error?: string }>({ bindingId: "" });
  useEffect(() => {
    if (!bindingId) return;
    let active = true;
    apiJson<MaterialPreviewProduct>(`/api/products/${encodeURIComponent(bindingId)}/material-preview`)
      .then((payload) => { if (active) setResult({ bindingId, product: payload.data, error: payload.error }); })
      .catch((error: unknown) => { if (active) setResult({ bindingId, error: error instanceof Error ? error.message : "材质 SKU 加载失败" }); });
    return () => { active = false; };
  }, [bindingId]);
  if (!bindings.length) return <div className="mtm-sku-preview"><p className="section-help">此模板尚未绑定 Shopify 商品。请先发布模板并完成商品绑定，再选择材质 SKU 预览合图。</p></div>;
  const loading = result.bindingId !== bindingId;
  const product = loading ? undefined : result.product;
  const variant = product?.variants.find((item) => item.id === variantId) ?? product?.variants[0];
  const base = draft.category === "trousers" ? variant?.trousersBase : variant?.jacketBase;
  return <div className="mtm-sku-preview">
    <div className="mtm-editor-grid">
      <Field label="预览商品"><select value={bindingId} onChange={(event) => { setBindingId(event.target.value); setVariantId(""); }}>{bindings.map((binding) => <option key={binding.id} value={binding.id}>{binding.productTitle}</option>)}</select></Field>
      <Field label="材质 SKU"><select disabled={loading || !product?.variants.length} value={variant?.id ?? ""} onChange={(event) => setVariantId(event.target.value)}>{product?.variants.map((item) => <option key={item.id} value={item.id}>{item.material}{item.sku ? ` · ${item.sku}` : ""}{item.available ? "" : "（不可售）"}</option>)}</select></Field>
    </div>
    {loading && <p className="section-help">正在读取 Shopify 材质 SKU 元字段…</p>}
    {!loading && result.error && <p role="alert">{result.error}</p>}
    {!loading && product && !product.variants.length && <p role="alert">该商品没有可用于预览的材质 SKU。</p>}
    {!loading && variant && !base && <p role="alert">材质“{variant.material}”尚未配置{draft.category === "trousers" ? "裤子" : "上衣"}底图元字段。</p>}
    {base && <><div className="mtm-layer-preview"><img src={base.url} alt={base.alt || `${variant?.material ?? "材质"}底图`}/>{layers.map((layer) => <img key={layer.key} src={layer.url} alt={layer.name}/>)}</div><p className="section-help">当前由材质 SKU 底图与 {layers.length} 个模板叠加图层合成，与消费者端的数据来源一致。</p></>}
  </div>;
}
