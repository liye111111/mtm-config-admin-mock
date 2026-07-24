import "@cloudflare/workers-types";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      SHOPIFY_CLIENT_ID?: string;
      SHOPIFY_CLIENT_SECRET?: string;
      SHOPIFY_ADMIN_ACCESS_TOKEN?: string;
      SHOPIFY_STORE?: string;
      SHOPIFY_AUTH_MODE?: "client_credentials" | "token_exchange";
    }
  }
}

export {};
