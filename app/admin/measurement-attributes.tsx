"use client";

import { useMemo, useState } from "react";
import type { MeasurementCanonicalUnit, MeasurementDimension } from "@/src/domain";
import type { MeasurementAttributeDraft, MeasurementAttributeView } from "./types";

const dimensionLabels: Record<MeasurementDimension, string> = { length: "长度", weight: "重量", size_code: "尺码编码", none: "无维度" };
const compatibleUnits: Record<MeasurementDimension, MeasurementCanonicalUnit[]> = { length: ["MM", "CM", "IN", "CHI"], weight: ["KG", "LB"], size_code: ["NONE"], none: ["NONE"] };

export function MeasurementAttributes({ items, draft, onDraft, onSave, onDelete, onToggle, onRefresh }: {
  items: MeasurementAttributeView[];
  draft: MeasurementAttributeDraft | null;
  onDraft: (draft: MeasurementAttributeDraft | null) => void;
  onSave: () => void;
  onDelete: (attribute: MeasurementAttributeView) => void;
  onToggle: (attribute: MeasurementAttributeView) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [dimension, setDimension] = useState<"all" | MeasurementDimension>("all");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const filtered = useMemo(() => items.filter((item) => {
    const matchesSearch = `${item.name}${item.code}${item.aliases.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (dimension === "all" || item.dimension === dimension) && (status === "all" || item.enabled === (status === "enabled"));
  }), [dimension, items, search, status]);
  const aliases = draft?.aliases.join("、") ?? "";
  const updateDimension = (next: MeasurementDimension) => {
    if (!draft) return;
    const unit = compatibleUnits[next].includes(draft.canonicalUnit) ? draft.canonicalUnit : compatibleUnits[next][0];
    onDraft({ ...draft, dimension: next, canonicalUnit: unit, valueType: next === "size_code" ? "enum" : draft.valueType === "enum" ? "number" : draft.valueType, precision: next === "size_code" ? 0 : draft.precision });
  };
  return <>
    <div className="head"><div><h2>量体属性</h2><p>统一维护量体字段的稳定编码、物理维度和标准单位。</p></div><div className="actions"><button className="secondary" onClick={onRefresh}>刷新</button><button className="primary" onClick={() => onDraft({ id: "", code: "", name: "", description: "", valueType: "number", dimension: "length", canonicalUnit: "CM", precision: 1, aliases: [], enabled: true })}>＋ 新建属性</button></div></div>
    {draft && <section className="panel binding-form measurement-attribute-form"><div className="form">
      <Field label="属性编码"><input value={draft.code} disabled={Boolean(draft.id)} placeholder="例如 chest" onChange={(event) => onDraft({ ...draft, code: event.target.value })}/></Field>
      <Field label="属性名称"><input value={draft.name} placeholder="例如 胸围" onChange={(event) => onDraft({ ...draft, name: event.target.value })}/></Field>
      <Field label="值类型"><select value={draft.valueType} onChange={(event) => onDraft({ ...draft, valueType: event.target.value as "number" | "enum", dimension: event.target.value === "enum" ? "size_code" : draft.dimension === "size_code" ? "length" : draft.dimension, canonicalUnit: event.target.value === "enum" ? "NONE" : draft.canonicalUnit === "NONE" ? "CM" : draft.canonicalUnit, precision: event.target.value === "enum" ? 0 : draft.precision })}><option value="number">数值</option><option value="enum">枚举</option></select></Field>
      <Field label="物理维度"><select value={draft.dimension} onChange={(event) => updateDimension(event.target.value as MeasurementDimension)}><option value="length">长度</option><option value="weight">重量</option><option value="size_code">尺码编码</option><option value="none">无维度</option></select></Field>
      <Field label="标准单位"><select value={draft.canonicalUnit} onChange={(event) => onDraft({ ...draft, canonicalUnit: event.target.value as MeasurementCanonicalUnit })}>{compatibleUnits[draft.dimension].map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
      <Field label="小数精度"><input type="number" min="0" max="6" value={draft.precision} disabled={draft.valueType === "enum"} onChange={(event) => onDraft({ ...draft, precision: Number(event.target.value) })}/></Field>
      <Field label="导入别名"><input value={aliases} placeholder="使用逗号或顿号分隔" onChange={(event) => onDraft({ ...draft, aliases: [...new Set(event.target.value.split(/[，,、]/).map((value) => value.trim()).filter(Boolean))] })}/></Field>
      <Field label="状态"><label className="compact-check"><input type="checkbox" checked={draft.enabled} onChange={(event) => onDraft({ ...draft, enabled: event.target.checked })}/> 允许新配置引用</label></Field>
      <div className="field measurement-attribute-description"><label>说明</label><textarea value={draft.description ?? ""} maxLength={500} placeholder="说明测量位置或录入要求" onChange={(event) => onDraft({ ...draft, description: event.target.value })}/></div>
    </div><div className="actions"><button className="secondary" onClick={() => onDraft(null)}>取消</button><button className="primary" disabled={!draft.code.trim() || !draft.name.trim()} onClick={onSave}>保存属性</button></div></section>}
    <section className="panel measurement-attribute-filters"><input className="search" value={search} placeholder="搜索名称、编码或别名" onChange={(event) => setSearch(event.target.value)}/><select value={dimension} onChange={(event) => setDimension(event.target.value as "all" | MeasurementDimension)}><option value="all">全部维度</option>{Object.entries(dimensionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value as "all" | "enabled" | "disabled")}><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option></select><span>显示 {filtered.length} / {items.length} 项</span></section>
    <div className="panel table-wrap"><table><thead><tr><th>属性</th><th>编码</th><th>类型</th><th>维度</th><th>标准单位</th><th>精度</th><th>别名</th><th>引用</th><th>状态</th><th>操作</th></tr></thead><tbody>{filtered.map((attribute) => <tr key={attribute.id}><td><strong>{attribute.name}</strong>{attribute.description && <small>{attribute.description}</small>}</td><td><code>{attribute.code}</code></td><td>{attribute.valueType === "number" ? "数值" : "枚举"}</td><td>{dimensionLabels[attribute.dimension]}</td><td>{attribute.canonicalUnit}</td><td>{attribute.valueType === "number" ? `${attribute.precision} 位` : "—"}</td><td>{attribute.aliases.length ? attribute.aliases.join("、") : "—"}</td><td>{attribute.referenceCount}</td><td><span className={`badge ${attribute.enabled ? "published" : "draft"}`}>{attribute.enabled ? "已启用" : "已停用"}</span></td><td><button className="link" onClick={() => onDraft({ id: attribute.id, code: attribute.code, name: attribute.name, description: attribute.description, valueType: attribute.valueType, dimension: attribute.dimension, canonicalUnit: attribute.canonicalUnit, precision: attribute.precision, aliases: [...attribute.aliases], enabled: attribute.enabled })}>编辑</button><button className="link" onClick={() => onToggle(attribute)}>{attribute.enabled ? "停用" : "启用"}</button><button className="link danger-text" disabled={attribute.referenceCount > 0} title={attribute.referenceCount ? "属性已被配置引用，请停用后保留" : ""} onClick={() => onDelete(attribute)}>删除</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty">没有符合当前筛选条件的量体属性。</div>}</div>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="field"><label>{label}</label>{children}</div>; }
