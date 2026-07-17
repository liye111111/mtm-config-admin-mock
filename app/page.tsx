import type { Metadata } from "next";
import { ConfigAdmin } from "./config-admin";
export const metadata: Metadata = { title: "MTM 定制配置中心", description: "服装定制模板、商品绑定与发布管理" };
export default function Home() { return <ConfigAdmin />; }
