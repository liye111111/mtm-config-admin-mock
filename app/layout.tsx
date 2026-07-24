import type { Metadata } from "next";
import Script from "next/script";
import { env } from "cloudflare:workers";
import "./globals.css";
export const metadata: Metadata = { title: "MTM 定制配置中心", description: "Shopify 服装定制 Mock Admin" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><head>{env.SHOPIFY_CLIENT_ID && <meta name="shopify-api-key" content={env.SHOPIFY_CLIENT_ID}/>}<Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" strategy="beforeInteractive"/></head><body>{children}</body></html>; }
