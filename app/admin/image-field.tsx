"use client";
/* eslint-disable @next/next/no-img-element */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ImageReference } from "@/src/domain";
import { apiJson, jsonRequest } from "./api";

export const ImagePickerPendingContext = createContext<(pending: boolean) => void>(() => undefined);

export function ImageField({ label, image, required, onChange }: {
  label: string; image?: ImageReference; required?: boolean; onChange: (image?: ImageReference) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const inFlight = useRef(false);
  const reportPending = useContext(ImagePickerPendingContext);
  useEffect(() => { active.current = true; return () => { active.current = false; if (inFlight.current) { inFlight.current = false; reportPending(false); } }; }, [reportPending]);
  async function choose() {
    if (inFlight.current) return;
    const intents = window.shopify?.intents;
    if (!intents) { setError("请从 Shopify Admin 打开 MTM 应用以使用原生素材选择器。"); return; }
    inFlight.current = true; reportPending(true); setPending(true); setError("");
    try {
      const activity = await intents.invoke("pick:shopify/File", { data: { mediaTypes: ["MediaImage"], multiSelect: false, selectedFiles: image ? [image.fileId] : [] } });
      const response = await activity.complete;
      if (!active.current || response.code === "closed") return;
      if (response.code !== "ok") throw new Error("图片选择未完成，请重试；原有图片未更改。");
      if (!response.data?.ids?.length) return;
      const result = await apiJson<ImageReference[]>("/api/shopify/files/resolve", jsonRequest("POST", { ids: [response.data.ids[0]] }));
      if (!result.data?.[0]) throw new Error("未获取到有效的 Shopify 图片。");
      if (active.current) onChange(result.data[0]);
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "图片选择失败，请重试"); }
    finally { if (inFlight.current) { inFlight.current = false; reportPending(false); } if (active.current) setPending(false); }
  }
  return <div className="mtm-image-field" aria-busy={pending}>
    <strong>{label}{required ? "（发布必填）" : "（可选）"}</strong>
    <div className="mtm-image-field__body">
      {image ? <img src={image.url} alt={image.alt || label} onError={() => setError("图片暂不可用，请重新选择素材。")} /> : <span className="mtm-image-placeholder">未选择图片</span>}
      <div className="mtm-image-field__actions">
        <button type="button" className="secondary" disabled={pending} onClick={() => void choose()}>{pending ? "正在选择…" : image ? "替换图片" : "选择 Shopify 图片"}</button>
        {image && <button type="button" className="link" disabled={pending} onClick={() => { setError(""); onChange(undefined); }}>解除关联</button>}
        {required && !image && <small className="danger-text">待补齐展示素材，可先保存草稿</small>}
      </div>
    </div>
    {error && <small className="danger-text" role="alert">{error}</small>}
  </div>;
}
