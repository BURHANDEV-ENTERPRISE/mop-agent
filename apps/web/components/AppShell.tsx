"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

export type AppViewer = {
  name: string;
  email: string;
  role: "owner" | "member";
};

function pageTitle(pathname: string): string {
  if (pathname === "/assistant") return "Assistant";
  if (pathname === "/brain/graph") return "Knowledge Graph";
  if (pathname.startsWith("/brain/")) return "Project Brain";
  if (pathname.startsWith("/brain")) return "Brain";
  if (pathname.startsWith("/chat/")) return "Project Chat";
  if (pathname.startsWith("/settings")) return "Settings";
  return "MOP-AGENT";
}

export function AppShell({ viewer, children }: { viewer: AppViewer; children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = viewer.role === "owner";
  const title = pageTitle(pathname);

  async function logout() {
    await signOut();
    window.location.replace("/setup");
  }

  const nav = [
    { href: "/assistant", label: "Assistant", icon: "✦", active: pathname.startsWith("/assistant") || pathname.startsWith("/chat/") },
    { href: "/brain", label: "Brain", icon: "◉", active: pathname.startsWith("/brain") },
  ];

  return (
    <div className="mop-app-frame">
      <header className="mop-app-topbar">
        <a className="mop-app-brand" href="/assistant" aria-label="MOP-AGENT home">
          <img src="/icon.svg" alt="" />
          <span>MOP-AGENT</span>
        </a>
        <div className="mop-app-topbar-main">
          <button
            className="mop-menu-toggle"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <div className="mop-topbar-title">
            <span className="mop-live-dot" />
            <strong>{title}</strong>
          </div>
          <div className="mop-topbar-center">MOP MEMORYCORE</div>
          <div className="mop-topbar-meta">
            <span>{isAdmin ? "ADMIN" : "MEMBER"}</span>
            <span className="mop-version">v0.1.8</span>
          </div>
        </div>
      </header>

      {menuOpen && <button className="mop-sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

      <aside className={`mop-app-sidebar${menuOpen ? " is-open" : ""}`}>
        <div className="mop-nav-section">
          <p>WORKSPACE</p>
          <nav>
            {nav.map((item) => (
              <a key={item.href} href={item.href} className={item.active ? "is-active" : ""} onClick={() => setMenuOpen(false)}>
                <span className="mop-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        </div>

        {isAdmin && (
          <div className="mop-nav-section">
            <p>ADMIN</p>
            <nav>
              <a href="/settings" className={pathname.startsWith("/settings") ? "is-active" : ""} onClick={() => setMenuOpen(false)}>
                <span className="mop-nav-icon">⚙</span>
                <span>Settings</span>
              </a>
            </nav>
          </div>
        )}

        <div className="mop-sidebar-spacer" />
        <button className="mop-account-card" type="button" onClick={logout} title="Sign out">
          <span className="mop-account-avatar">{viewer.name.slice(0, 1).toUpperCase()}</span>
          <span className="mop-account-copy">
            <strong>{viewer.name}</strong>
            <small>{isAdmin ? "Administrator" : "Member"}</small>
          </span>
          <span aria-hidden="true">↪</span>
        </button>
      </aside>

      <main className="mop-app-main">{children}</main>
    </div>
  );
}
