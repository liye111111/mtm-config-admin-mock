export async function apiJson<T>(url: string, options?: RequestInit): Promise<{ error?: string; data?: T }> {
  const response = await fetch(url, options);
  const payload = await response.json() as { error?: string; data?: T };
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "请求失败");
  return payload;
}

export const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
