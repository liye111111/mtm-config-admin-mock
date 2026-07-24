"use client";

export type AdminView = "templates" | "products";

export function AdminShell({ view, onNavigate, children }: { view: AdminView; onNavigate: (view: AdminView) => void; children: React.ReactNode }) {
  return <div className="shell">
    <header className="top">
      <div className="app-title"><span className="mark">M</span><div><h1>MTM 定制配置中心</h1><p>商品定制管理</p></div></div>
      <nav className="nav" aria-label="应用导航">
        <button className={view === "templates" ? "active" : ""} onClick={() => onNavigate("templates")}>定制模板</button>
        <button className={view === "products" ? "active" : ""} onClick={() => onNavigate("products")}>商品绑定</button>
      </nav>
      <span className="env">Schema v2</span>
    </header>
    <main className="main"><div className="content">{children}</div></main>
  </div>;
}

