import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "MTM 定制配置中心", description: "Shopify 服装定制 Mock Admin" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
