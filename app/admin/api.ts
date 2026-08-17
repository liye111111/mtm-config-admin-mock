export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function isAuthorizationError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export async function apiJson<T>(url: string, options?: RequestInit): Promise<{ error?: string; data?: T }> {
  const headers = new Headers(options?.headers);
  if (typeof window !== "undefined" && window.shopify?.idToken) {
    try { headers.set("Authorization", `Bearer ${await window.shopify.idToken()}`); }
    catch { throw new ApiError("请从 Shopify Admin 重新打开应用", 401); }
  }
  else if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) headers.set("X-MTM-Mock-Shopify", "1");
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json() as { error?: string; data?: T };
  if (!response.ok) throw new ApiError(typeof payload.error === "string" ? payload.error : "请求失败", response.status);
  return payload;
}

export const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

declare global {
  interface Window {
    shopify?: {
      idToken(): Promise<string>;
      resourcePicker(options: { type: "product"; multiple: boolean; filter?: { variants?: boolean; status?: string } }): Promise<Array<{ id: string; title: string; handle?: string; status?: string; images?: Array<{ originalSrc?: string; altText?: string }>; variants?: Array<unknown> }> | undefined>;
    };
  }
}
