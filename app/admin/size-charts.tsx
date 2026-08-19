"use client";

import { useEffect, useMemo, useState } from "react";
import { sizeRecommendationAlgorithms, type DirectLookupConfig, type MeasurementAttribute, type NearestProfileConfig, type RangeMatrixConfig, type SizeChartConfig, type SizeChartInputAttribute, type SizeChartVersionView, type SizeChartView, type SizeDefinition, type SizeRecommendationAlgorithmCode } from "@/src/domain";
import { apiJson, jsonRequest } from "./api";

type Tab = "base" | "configuration" | "versions";
type Notice = { type: "success" | "error"; text: string };

const algorithms = Object.entries(sizeRecommendationAlgorithms) as Array<[SizeRecommendationAlgorithmCode, (typeof sizeRecommendationAlgorithms)[SizeRecommendationAlgorithmCode]]>;
const clone = <T,>(value: T): T => structuredClone(value);
const directConfig = (config: SizeChartConfig) => config as DirectLookupConfig;

function blankConfig(code: SizeRecommendationAlgorithmCode, previous?: SizeChartConfig): SizeChartConfig {
  const inputAttributes = clone(previous?.inputAttributes ?? []);
  const sizes = clone(previous?.sizes ?? []);
  if (code === "range_matrix") return { schemaVersion: 1, algorithm: { code, version: 1 }, inputAttributes, sizes, data: { rows: [] } };
  if (code === "nearest_profile") return { schemaVersion: 1, algorithm: { code, version: 1 }, inputAttributes, sizes, data: { profiles: sizes.map((size) => ({ sizeCode: size.code, measurements: {} })), maxDistance: 10 } };
  return { schemaVersion: 1, algorithm: { code, version: 1 }, inputAttributes: inputAttributes.slice(0, 1), sizes, data: { attributeCode: inputAttributes[0]?.attributeCode ?? "", mappings: [] } };
}

export function SizeCharts({ measurementAttributes }: { measurementAttributes: MeasurementAttribute[] }) {
  const [items, setItems] = useState<SizeChartView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<SizeChartView | null>(null);
  const [versions, setVersions] = useState<SizeChartVersionView[]>([]);
  const [tab, setTab] = useState<Tab>("base");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [creating, setCreating] = useState<{ code: string; name: string; description: string } | null>(null);

  const filtered = useMemo(() => items.filter((item) => `${item.name}${item.code}${item.description ?? ""}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const config = draft?.draftConfig ?? null;

  async function load(preferred?: string) {
    const payload = await apiJson<SizeChartView[]>("/api/size-charts");
    const list = payload.data ?? [];
    setItems(list);
    const id = preferred ?? selectedId ?? list[0]?.id ?? "";
    const selected = list.find((item) => item.id === id) ?? list[0] ?? null;
    setSelectedId(selected?.id ?? "");
    setDraft(selected ? clone(selected) : null);
  }

  async function run(operation: () => Promise<void>, message: string) {
    setBusy(true); setNotice(null);
    try { await operation(); setNotice({ type: "success", text: message }); }
    catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "操作失败" }); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    // Initial API hydration intentionally updates local UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error: unknown) => setNotice({ type: "error", text: error instanceof Error ? error.message : "尺码表加载失败" }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(item: SizeChartView) { setSelectedId(item.id); setDraft(clone(item)); setTab("base"); setVersions([]); setNotice(null); }
  function updateConfig(updater: (next: SizeChartConfig) => void) { if (!draft?.draftConfig) return; const next = clone(draft); updater(next.draftConfig!); setDraft(next); }
  function updateSizes(sizes: SizeDefinition[]) { updateConfig((next) => { next.sizes = sizes.map((size, index) => ({ ...size, sortOrder: index * 10 + 10 })); }); }
  function updateInputs(inputAttributes: SizeChartInputAttribute[]) { updateConfig((next) => { next.inputAttributes = inputAttributes; if (next.algorithm.code === "direct_lookup") directConfig(next).data.attributeCode = inputAttributes[0]?.attributeCode ?? ""; }); }

  async function createChart() {
    if (!creating) return;
    await run(async () => {
      const payload = await apiJson<SizeChartView>("/api/size-charts", jsonRequest("POST", creating));
      setCreating(null); await load(payload.data?.id);
    }, "尺码表已创建，请继续配置并发布");
  }
  async function save() {
    if (!draft?.draftConfig) return;
    await run(async () => { await apiJson(`/api/size-charts/${draft.id}`, jsonRequest("PUT", { name: draft.name, description: draft.description ?? "", status: draft.status, config: draft.draftConfig })); await load(draft.id); }, "尺码表草稿已保存");
  }
  async function publish() {
    if (!draft) return;
    await run(async () => { await saveWithoutNotice(); await apiJson(`/api/size-charts/${draft.id}/publish`, { method: "POST" }); await load(draft.id); }, `尺码表 v${draft.draftVersion ?? 1} 已发布`);
  }
  async function saveWithoutNotice() { if (!draft?.draftConfig) return; await apiJson(`/api/size-charts/${draft.id}`, jsonRequest("PUT", { name: draft.name, description: draft.description ?? "", status: draft.status, config: draft.draftConfig })); }
  async function remove() {
    if (!draft || !confirm(`确认删除尺码表“${draft.name}”？`)) return;
    await run(async () => { await apiJson(`/api/size-charts/${draft.id}`, { method: "DELETE" }); await load(""); }, "尺码表已删除");
  }
  async function openVersions() { setTab("versions"); if (!draft) return; const payload = await apiJson<SizeChartVersionView[]>(`/api/size-charts/${draft.id}/versions`); setVersions(payload.data ?? []); }

  return <>
    {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
    <div className="head"><div><h2>尺码表</h2><p>配置量体到推荐尺码的算法和数据；推荐逻辑与颜色、库存无关。</p></div><button className="primary" onClick={() => setCreating({ code: "", name: "", description: "" })}>＋ 新建尺码表</button></div>
    {creating && <section className="panel binding-form size-chart-create"><div className="form"><Field label="尺码表编码"><input value={creating.code} placeholder="mens_jacket" onChange={(event) => setCreating({ ...creating, code: event.target.value })}/></Field><Field label="尺码表名称"><input value={creating.name} placeholder="男士西服上衣尺码表" onChange={(event) => setCreating({ ...creating, name: event.target.value })}/></Field><Field label="说明"><input value={creating.description} onChange={(event) => setCreating({ ...creating, description: event.target.value })}/></Field></div><div className="actions"><button className="secondary" onClick={() => setCreating(null)}>取消</button><button className="primary" disabled={busy || !creating.code.trim() || !creating.name.trim()} onClick={() => void createChart()}>创建</button></div></section>}
    <div className="work size-chart-work">
      <aside className="panel"><div className="panel-title">尺码表列表</div><div className="search-wrap"><input className="search" value={search} placeholder="搜索尺码表名称或编码" onChange={(event) => setSearch(event.target.value)}/></div><div className="list">{filtered.map((item) => <button key={item.id} className={`card ${item.id === selectedId ? "active" : ""}`} onClick={() => choose(item)}><strong>{item.name}<span className={`badge ${item.status}`}>{item.status === "active" ? "启用" : "停用"}</span></strong><small>{item.code} · {item.currentVersion ? `已发布 v${item.currentVersion}` : "未发布"}{item.draftVersion ? ` · 草稿 v${item.draftVersion}` : ""}</small></button>)}{!filtered.length && <div className="empty">暂无尺码表</div>}</div></aside>
      <section className="panel editor size-chart-editor">
        {!draft || !config ? <div className="empty">新建或选择一张尺码表开始配置</div> : <>
          <div className="editor-head"><div><h3>{draft.name}</h3><p><code>{draft.code}</code> · 草稿 v{draft.draftVersion}</p></div><div className="actions"><button className="danger" disabled={busy || Boolean(draft.currentVersionId)} title={draft.currentVersionId ? "已发布尺码表只能停用" : ""} onClick={() => void remove()}>删除</button><button className="secondary" disabled={busy} onClick={() => void save()}>保存草稿</button><button className="primary" disabled={busy} onClick={() => void publish()}>校验并发布</button></div></div>
          <div className="tabs"><button className={tab === "base" ? "active" : ""} onClick={() => setTab("base")}>基本信息</button><button className={tab === "configuration" ? "active" : ""} onClick={() => setTab("configuration")}>算法与尺码数据</button><button className={tab === "versions" ? "active" : ""} onClick={() => void openVersions()}>版本历史</button></div>
          {tab === "base" && <BaseTab draft={draft} onChange={setDraft}/>} 
          {tab === "configuration" && <ConfigurationTab config={config} attributes={measurementAttributes.filter((item) => item.enabled && item.valueType === "number")} onConfig={updateConfig} onInputs={updateInputs} onSizes={updateSizes}/>} 
          {tab === "versions" && <VersionsTab versions={versions}/>} 
        </>}
      </section>
    </div>
  </>;
}

function BaseTab({ draft, onChange }: { draft: SizeChartView; onChange: (draft: SizeChartView) => void }) {
  return <div className="form size-chart-base"><Field label="名称"><input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })}/></Field><Field label="编码"><input value={draft.code} disabled/></Field><Field label="状态"><select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as SizeChartView["status"] })}><option value="active">启用</option><option value="disabled">停用</option></select></Field><Field label="说明"><textarea value={draft.description ?? ""} onChange={(event) => onChange({ ...draft, description: event.target.value })}/></Field></div>;
}

function ConfigurationTab({ config, attributes, onConfig, onInputs, onSizes }: { config: SizeChartConfig; attributes: MeasurementAttribute[]; onConfig: (updater: (next: SizeChartConfig) => void) => void; onInputs: (items: SizeChartInputAttribute[]) => void; onSizes: (items: SizeDefinition[]) => void }) {
  const selectedCodes = new Set(config.inputAttributes.map((item) => item.attributeCode));
  const info = sizeRecommendationAlgorithms[config.algorithm.code];
  function switchAlgorithm(code: SizeRecommendationAlgorithmCode) { onConfig((next) => Object.assign(next, blankConfig(code, next))); }
  return <div className="size-chart-config">
    <section className="config-section"><div className="section-title"><div><h4>推荐算法</h4><p>算法由代码实现并版本化，页面只维护算法所需的数据。</p></div></div><div className="algorithm-grid">{algorithms.map(([code, item]) => <button key={code} disabled={code !== "range_matrix"} className={`algorithm-card ${config.algorithm.code === code ? "selected" : ""}`} onClick={() => switchAlgorithm(code)}><strong>{item.name}{code !== "range_matrix" && <em>暂未开放</em>}</strong><small>{code}@1</small><span>{item.summary}</span></button>)}</div><div className="algorithm-explanation"><strong>{info.name}的计算逻辑</strong><ol>{info.calculation.map((line) => <li key={line}>{line}</li>)}</ol></div></section>
    <section className="config-section"><div className="section-title"><div><h4>输入量体属性</h4><p>引用量体元数据；单位换算和精度以元数据配置为准。</p></div></div><div className="attribute-choice-grid">{attributes.map((attribute) => <label key={attribute.code} className={selectedCodes.has(attribute.code) ? "selected" : ""}><input type="checkbox" checked={selectedCodes.has(attribute.code)} disabled={config.algorithm.code === "direct_lookup" && !selectedCodes.has(attribute.code) && config.inputAttributes.length >= 1} onChange={(event) => onInputs(event.target.checked ? [...config.inputAttributes, { attributeCode: attribute.code, required: true, weight: 1 }] : config.inputAttributes.filter((item) => item.attributeCode !== attribute.code))}/><span><strong>{attribute.name}</strong><small>{attribute.code} · {attribute.canonicalUnit}</small></span></label>)}</div>{config.algorithm.code === "nearest_profile" && <div className="weight-editor">{config.inputAttributes.map((item) => <Field key={item.attributeCode} label={`${item.attributeCode} 权重`}><input type="number" min="0.01" step="0.1" value={item.weight ?? 1} onChange={(event) => onConfig((next) => { const target = next.inputAttributes.find((entry) => entry.attributeCode === item.attributeCode); if (target) target.weight = Number(event.target.value); })}/></Field>)}</div>}</section>
    <section className="config-section"><div className="section-title"><div><h4>可推荐尺码</h4><p>尺码编码用于算法输出，名称用于后台和前台展示。</p></div><button className="secondary" onClick={() => onSizes([...config.sizes, { code: "", label: "", sortOrder: config.sizes.length * 10 + 10 }])}>＋ 添加尺码</button></div><div className="size-definition-table"><div className="size-definition-row size-definition-head"><span>序号</span><span>尺码编码</span><span>显示名称</span><span>操作</span></div>{config.sizes.map((size, index) => <div className="size-definition-row" key={`${index}-${size.code}`}><span>{index + 1}</span><input value={size.code} placeholder="175_92A" onChange={(event) => { const next = clone(config.sizes); next[index].code = event.target.value; onSizes(next); }}/><input value={size.label} placeholder="175/92A" onChange={(event) => { const next = clone(config.sizes); next[index].label = event.target.value; onSizes(next); }}/><button className="delete" onClick={() => onSizes(config.sizes.filter((_, itemIndex) => itemIndex !== index))}>删除</button></div>)}</div></section>
    <section className="config-section"><div className="section-title"><div><h4>算法数据</h4><p>以下字段由 {info.name} 算法定义，不是可执行表达式。</p></div></div><AlgorithmData config={config} onConfig={onConfig}/></section>
  </div>;
}

function AlgorithmData({ config, onConfig }: { config: SizeChartConfig; onConfig: (updater: (next: SizeChartConfig) => void) => void }) {
  if (config.algorithm.code === "range_matrix") {
    const rangeConfig = config as RangeMatrixConfig;
    return <><div className="matrix-wrap"><div className="matrix-row matrix-head"><span>序号</span>{rangeConfig.inputAttributes.map((item) => <span key={item.attributeCode}>{item.attributeCode} 最小/最大</span>)}<span>推荐尺码</span><span/></div>{rangeConfig.data.rows.map((row, index) => <div className="matrix-row" key={row.id}><span>{index + 1}</span>{rangeConfig.inputAttributes.map((item) => <div className="range-pair" key={item.attributeCode}><input type="number" value={row.ranges[item.attributeCode]?.min ?? ""} onChange={(event) => onConfig((next) => { const target = next as RangeMatrixConfig; const range = target.data.rows[index].ranges[item.attributeCode] ?? { min: 0, max: 0 }; range.min = Number(event.target.value); target.data.rows[index].ranges[item.attributeCode] = range; })}/><input type="number" value={row.ranges[item.attributeCode]?.max ?? ""} onChange={(event) => onConfig((next) => { const target = next as RangeMatrixConfig; const range = target.data.rows[index].ranges[item.attributeCode] ?? { min: 0, max: 0 }; range.max = Number(event.target.value); target.data.rows[index].ranges[item.attributeCode] = range; })}/></div>)}<SizeSelect value={row.sizeCode} sizes={rangeConfig.sizes} onChange={(value) => onConfig((next) => { (next as RangeMatrixConfig).data.rows[index].sizeCode = value; })}/><button className="delete" onClick={() => onConfig((next) => { (next as RangeMatrixConfig).data.rows.splice(index, 1); })}>删除</button></div>)}</div><button className="secondary add-data-row" onClick={() => onConfig((next) => { const target = next as RangeMatrixConfig; target.data.rows.push({ id: crypto.randomUUID(), ranges: Object.fromEntries(target.inputAttributes.map((item) => [item.attributeCode, { min: 0, max: 0 }])), sizeCode: target.sizes[0]?.code ?? "" }); })}>＋ 添加区间行</button></>;
  }
  if (config.algorithm.code === "nearest_profile") {
    const profileConfig = config as NearestProfileConfig;
    return <><Field label="最大容差"><input type="number" min="0.01" value={profileConfig.data.maxDistance} onChange={(event) => onConfig((next) => { (next as NearestProfileConfig).data.maxDistance = Number(event.target.value); })}/></Field><div className="matrix-wrap"><div className="matrix-row profile-row matrix-head"><span>尺码</span>{profileConfig.inputAttributes.map((item) => <span key={item.attributeCode}>{item.attributeCode}</span>)}</div>{profileConfig.sizes.map((size) => { const profile = profileConfig.data.profiles.find((item) => item.sizeCode === size.code); return <div className="matrix-row profile-row" key={size.code}><strong>{size.label || size.code}</strong>{profileConfig.inputAttributes.map((item) => <input key={item.attributeCode} type="number" value={profile?.measurements[item.attributeCode] ?? ""} onChange={(event) => onConfig((next) => { const data = (next as NearestProfileConfig).data; let target = data.profiles.find((entry) => entry.sizeCode === size.code); if (!target) { target = { sizeCode: size.code, measurements: {} }; data.profiles.push(target); } target.measurements[item.attributeCode] = Number(event.target.value); })}/>)}</div>; })}</div></>;
  }
  const lookupConfig = config as DirectLookupConfig;
  return <><Field label="映射量体属性"><select value={lookupConfig.data.attributeCode} onChange={(event) => onConfig((next) => { directConfig(next).data.attributeCode = event.target.value; })}>{lookupConfig.inputAttributes.map((item) => <option key={item.attributeCode}>{item.attributeCode}</option>)}</select></Field><div className="lookup-table">{lookupConfig.data.mappings.map((mapping, index) => <div className="lookup-row" key={index}><input type="number" value={mapping.min} aria-label="最小值" onChange={(event) => onConfig((next) => { directConfig(next).data.mappings[index].min = Number(event.target.value); })}/><span>至</span><input type="number" value={mapping.max} aria-label="最大值" onChange={(event) => onConfig((next) => { directConfig(next).data.mappings[index].max = Number(event.target.value); })}/><SizeSelect value={mapping.sizeCode} sizes={lookupConfig.sizes} onChange={(value) => onConfig((next) => { directConfig(next).data.mappings[index].sizeCode = value; })}/><button className="delete" onClick={() => onConfig((next) => { directConfig(next).data.mappings.splice(index, 1); })}>删除</button></div>)}</div><button className="secondary add-data-row" onClick={() => onConfig((next) => { const target = directConfig(next); target.data.mappings.push({ min: 0, max: 0, sizeCode: target.sizes[0]?.code ?? "" }); })}>＋ 添加映射</button></>;
}

function SizeSelect({ value, sizes, onChange }: { value: string; sizes: SizeDefinition[]; onChange: (value: string) => void }) { return <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">请选择尺码</option>{sizes.map((size) => <option key={size.code} value={size.code}>{size.label || size.code}</option>)}</select>; }
function VersionsTab({ versions }: { versions: SizeChartVersionView[] }) { return <div className="panel table-wrap embedded-table"><table><thead><tr><th>版本</th><th>状态</th><th>算法</th><th>创建时间</th><th>发布时间</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>v{version.version}</strong></td><td>{version.status === "draft" ? "草稿" : version.status === "published" ? "当前发布" : "历史发布"}</td><td><code>{version.algorithmCode}@{version.algorithmVersion}</code></td><td>{new Date(version.createdAt).toLocaleString("zh-CN")}</td><td>{version.publishedAt ? new Date(version.publishedAt).toLocaleString("zh-CN") : "—"}</td></tr>)}</tbody></table></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
