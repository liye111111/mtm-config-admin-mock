/** Shopify Admin API boundary. Add credentials to Env only when product synchronization is enabled. */
export class ShopifyAdminClient {
  constructor(private readonly shop: string, private readonly accessToken: string, private readonly apiVersion = "2026-07") {}
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": this.accessToken }, body: JSON.stringify({ query, variables }) });
    if (!response.ok) throw new Error(`Shopify Admin API request failed (${response.status})`);
    const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
    if (!payload.data) throw new Error("Shopify Admin API returned no data");
    return payload.data;
  }
}
