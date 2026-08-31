"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, type ReactNode } from "react";
import { DEFAULT_EMBROIDERY_CONFIG, type CustomizationStep, type CustomizationOption, type OptionGroup, type DisplayStyle, type TextInputConfig } from "@/src/domain";
import type { TemplateView } from "./types";
import { ImageField, ImagePickerPendingContext } from "./image-field";

const stepTypes: Array<[CustomizationStep["type"], string]> = [["options", "选项步骤"], ["embroidery", "刺绣定制"], ["components", "组合/套装"], ["measurements", "量体尺寸"], ["review", "配置确认"]];
const styles: Array<[DisplayStyle, string]> = [["image_text", "图文"], ["text", "文本"], ["icon_text", "图标＋文本"]];
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="mtm-editor-field"><span>{label}</span>{children}</label>; }
function codeFor(prefix: string, items: Array<{ code: string }>) { let index = 1; const codes = new Set(items.map((item) => item.code)); while (codes.has(`${prefix}_${index}`)) index++; return `${prefix}_${index}`; }
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

export function TemplateSteps({ draft, disabled, onDraft, onImagePending }: {
  draft: TemplateView; disabled: boolean; onDraft: (update: (draft: TemplateView) => void) => void; onImagePending: (pending: boolean) => void;
}) {
  // 异步选图回填使用稳定 ID 定位；删除、移动或切换模板后不能写入其他对象。
  const update = (operation: (next: TemplateView) => void) => onDraft((next) => { if (next.id === draft.id) operation(next); });
  const stepChange = (id: string, operation: (step: CustomizationStep) => void) => update((next) => { const step = next.config.steps.find((item) => item.id === id); if (step) operation(step); });
  const groupChange = (id: string, operation: (group: OptionGroup) => void) => update((next) => { const group = next.config.steps.flatMap((step) => step.optionGroups).find((item) => item.id === id); if (group) operation(group); });
  const optionChange = (groupId: string, id: string, operation: (option: CustomizationOption) => void) => groupChange(groupId, (group) => { const option = group.options.find((item) => item.id === id); if (option) operation(option); });
  function addStep() {
    update((next) => next.config.steps.push({ id: crypto.randomUUID(), code: codeFor("step", next.config.steps), title: "新步骤", type: "options", required: true, enabled: true, sortOrder: Math.max(-1, ...next.config.steps.map((step) => step.sortOrder)) + 1, optionGroups: [] }));
  }
  function addGroup(stepId: string) {
    const code = codeFor("group", draft.config.steps.flatMap((step) => step.optionGroups));
    stepChange(stepId, (step) => step.optionGroups.push({ id: crypto.randomUUID(), code, title: "新选项组", displayStyle: "text", required: true, enabled: true, sortOrder: Math.max(-1, ...step.optionGroups.map((group) => group.sortOrder)) + 1, options: [createOption([])] }));
  }
  function createOption(options: CustomizationOption[]): CustomizationOption {
    return { id: crypto.randomUUID(), code: codeFor("option", options), name: "新选项", sortOrder: Math.max(-1, ...options.map((option) => option.sortOrder)) + 1, enabled: true, defaultSelected: false, applicableCategories: [draft.category], affectsPrice: false };
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
    stepChange(step.id, (item) => {
      item.type = type; item.optionGroups = []; delete item.textInput; delete item.embroidery;
      if (type === "embroidery") { item.textInput = { minLength: 1, maxLength: 20, placeholder: "请输入刺绣文字", characterPolicy: "unicode_text" }; item.embroidery = structuredClone(DEFAULT_EMBROIDERY_CONFIG); }
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
  const steps = ordered(draft.config.steps);
  return <ImagePickerPendingContext.Provider value={onImagePending}><fieldset className="mtm-step-editor" disabled={disabled}>
    <div className="section-title"><h4>步骤 → 选项组 → 选项</h4><button type="button" className="secondary" onClick={addStep}>＋ 添加步骤</button></div>
    <p className="section-help">消费者一页一个步骤。步骤内可配置多个独立单选组；样式属于选项组，标签仅展示、不影响价格。</p>
    <p className="section-help">图片通过 Shopify 原生素材选择器管理。步骤默认大图可不填；图文／图标组的启用选项发布时必须有展示素材。</p>
    {!steps.length && <div className="empty">暂无步骤，请添加。</div>}
    {steps.map((step, stepIndex) => <section className="mtm-step-card" key={step.id}>
      <div className="mtm-editor-heading"><strong>步骤 {stepIndex + 1} · {step.title}</strong><div className="actions"><OrderButtons index={stepIndex} count={steps.length} onMove={(delta) => update((next) => move(next.config.steps, step.id, delta))}/><button type="button" className="link danger-text" onClick={() => { if (confirm(`删除步骤“${step.title}”及其选项组？`)) update((next) => { next.config.steps = next.config.steps.filter((item) => item.id !== step.id); }); }}>删除步骤</button></div></div>
      <div className="mtm-editor-grid">
        <Field label="步骤名称"><input value={step.title} onChange={(event) => stepChange(step.id, (item) => { item.title = event.target.value; })}/></Field>
        <Field label="步骤编码"><input value={step.code} onChange={(event) => stepChange(step.id, (item) => { item.code = event.target.value; })}/></Field>
        <Field label="步骤类型"><select value={step.type} onChange={(event) => changeType(step, event.target.value as CustomizationStep["type"])}>{stepTypes.filter(([type]) => type !== "components" || draft.config.templateType === "composite").map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></Field>
        <Field label="步骤说明"><input value={step.description ?? ""} onChange={(event) => stepChange(step.id, (item) => { item.description = event.target.value; })}/></Field>
      </div>
      <label className="check-row"><input type="checkbox" checked={step.enabled} onChange={(event) => stepChange(step.id, (item) => { item.enabled = event.target.checked; })}/>启用步骤</label>
      <ImageField label="步骤默认大图" image={step.defaultPreviewImage} onChange={(image) => stepChange(step.id, (item) => { item.defaultPreviewImage = image; })}/>
      {step.type === "embroidery" && <EmbroideryFields config={step.textInput} onChange={(textInput) => stepChange(step.id, (item) => { item.textInput = textInput; })}/>}
      {step.type === "options" && <>
        <div className="mtm-editor-heading"><strong>选项组（{step.optionGroups.length}）</strong><button type="button" className="secondary" onClick={() => addGroup(step.id)}>＋ 添加选项组</button></div>
        {ordered(step.optionGroups).map((group, groupIndex) => <section className="mtm-group-card" key={group.id}>
          <div className="mtm-editor-heading"><strong>{group.title}</strong><div className="actions"><OrderButtons index={groupIndex} count={step.optionGroups.length} onMove={(delta) => stepChange(step.id, (item) => move(item.optionGroups, group.id, delta))}/><button type="button" className="link danger-text" onClick={() => { if (confirm(`删除选项组“${group.title}”及其选项？`)) stepChange(step.id, (item) => { item.optionGroups = item.optionGroups.filter((entry) => entry.id !== group.id); }); }}>删除组</button></div></div>
          <div className="mtm-editor-grid">
            <Field label="组名称"><input value={group.title} onChange={(event) => groupChange(group.id, (item) => { item.title = event.target.value; })}/></Field>
            <Field label="组编码（模板内唯一）"><input value={group.code} onChange={(event) => groupChange(group.id, (item) => { item.code = event.target.value; })}/></Field>
            <Field label="统一展示样式"><select value={group.displayStyle} onChange={(event) => changeStyle(group.id, event.target.value as DisplayStyle)}>{styles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="所属步骤"><select value={step.id} onChange={(event) => relocate(group.id, event.target.value)}>{steps.filter((entry) => entry.type === "options").map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></Field>
            <Field label="组说明"><input value={group.description ?? ""} onChange={(event) => groupChange(group.id, (item) => { item.description = event.target.value; })}/></Field>
          </div>
          <div className="check-row"><label><input type="checkbox" checked={group.enabled} onChange={(event) => groupChange(group.id, (item) => { item.enabled = event.target.checked; })}/>启用组</label><label><input type="checkbox" checked={group.required} onChange={(event) => groupChange(group.id, (item) => { item.required = event.target.checked; })}/>必选</label></div>
          <div className="mtm-editor-heading"><span>候选选项</span><button type="button" className="secondary" onClick={() => addOption(group.id)}>＋ 添加选项</button></div>
          {group.displayStyle !== "text" && <p className="section-help">{group.displayStyle === "icon_text" ? "请在每个选项下选择图标素材" : "请在每个选项下选择展示图片"}，同组样式统一，素材分别配置。选中后预览大图单独设置。</p>}
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
              <ImageField label="选中后预览大图" image={option.previewImage} onChange={(image) => optionChange(group.id, option.id, (item) => { item.previewImage = image; })}/>
            </div>
          </div>)}
          {!group.options.length && <p className="section-help">暂无选项，请点击“＋ 添加选项”配置文字及图片；空组不会在消费者端显示。</p>}
        </section>)}
        <StepPreview key={`${draft.id}:${step.id}`} step={step}/>
      </>}
    </section>)}
  </fieldset></ImagePickerPendingContext.Provider>;
}

function EmbroideryFields({ config, onChange }: { config?: TextInputConfig; onChange: (config: TextInputConfig) => void }) {
  const value = config ?? { minLength: 1, maxLength: 20, characterPolicy: "unicode_text" as const };
  return <div className="mtm-editor-grid">
    <Field label="最小字符数"><input type="number" min={0} max={200} value={value.minLength} onChange={(event) => onChange({ ...value, minLength: Number(event.target.value) })}/></Field>
    <Field label="最大字符数"><input type="number" min={1} max={200} value={value.maxLength} onChange={(event) => onChange({ ...value, maxLength: Number(event.target.value) })}/></Field>
    <Field label="占位文案"><input value={value.placeholder ?? ""} onChange={(event) => onChange({ ...value, placeholder: event.target.value })}/></Field>
    <Field label="字符规则"><select value={value.characterPolicy} onChange={(event) => onChange({ ...value, characterPolicy: event.target.value as TextInputConfig["characterPolicy"] })}><option value="unicode_text">全部 Unicode（含 emoji）</option><option value="letters_numbers_spaces">英文、数字和空格</option><option value="letters_only">仅英文字母</option></select></Field>
  </div>;
}

function StepPreview({ step }: { step: CustomizationStep }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [last, setLast] = useState<{ group: string; option: string } | null>(null);
  const groups = ordered(step.optionGroups).filter((group) => group.enabled && group.options.some((option) => option.enabled));
  const selected = last && groups.find((group) => group.id === last.group)?.options.find((option) => option.id === last.option && option.enabled);
  const preview = selected && selected.previewImage || step.defaultPreviewImage;
  return <details className="mtm-step-preview"><summary>预览本步骤（仅后台预览，不保存试选结果）</summary>
    {!step.enabled ? <p>步骤已停用，消费者端不显示。</p> : <>
      {preview && <img className="mtm-preview-hero" src={preview.url} alt={preview.alt || step.title}/>}
      {!groups.length && <p>没有启用的可选组，消费者端将跳过此步骤。</p>}
      {groups.map((group) => <div key={group.id}><h4>{group.title}{group.required ? " *" : ""}</h4><p>{group.description}</p>{ordered(group.options).filter((option) => option.enabled).map((option) => {
        const choice = group.options.find((entry) => entry.id === choices[group.id] && entry.enabled)?.id ?? group.options.find((entry) => entry.enabled && entry.defaultSelected)?.id;
        return <button type="button" key={option.id} className={`mtm-preview-option ${group.displayStyle}`} aria-pressed={choice === option.id} onClick={() => { setChoices((current) => ({ ...current, [group.id]: option.id })); setLast({ group: group.id, option: option.id }); }}>
          {group.displayStyle !== "text" && option.displayImage && <img src={option.displayImage.url} alt={option.displayImage.alt}/>}
          <span><strong>{option.name}</strong>{option.badge?.text.trim() && <span className="mtm-discount-badge">{option.badge.text}</span>}<small>{option.description}</small></span><span aria-hidden="true">{choice === option.id ? "✓" : ""}</span>
        </button>;
      })}</div>)}
    </>}
  </details>;
}
