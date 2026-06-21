"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import { signOut } from "@/lib/auth-client";

export type AppViewer = {
  name: string;
  email: string;
  role: "owner" | "member";
};

export type Project = { id: string; name: string; status: string };

interface MemoryCoreContextType {
  projects: Project[];
  settingsSection: "providers" | "users";
  setSettingsSection: (section: "providers" | "users") => void;
}

const MemoryCoreContext = createContext<MemoryCoreContextType | undefined>(undefined);

export function useMemoryCore() {
  const context = useContext(MemoryCoreContext);
  if (!context) throw new Error("useMemoryCore must be used within a MemoryCoreProvider");
  return context;
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [settingsSection, setSettingsSection] = useState<"providers" | "users">("providers");
  const isAdmin = viewer.role === "owner";
  const isSettings = pathname.startsWith("/settings");
  const title = pageTitle(pathname);

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => response.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => {});

    const requested = new URLSearchParams(window.location.search).get("section");
    if (requested === "users") setSettingsSection("users");
    setSidebarCollapsed(window.localStorage.getItem("mop-agent-sidebar-collapsed") === "1");
  }, []);

  useEffect(() => {
    if (!accountDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountDrawerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [accountDrawerOpen]);

  async function logout() {
    await signOut();
    window.location.replace("/login");
  }

  function selectSection(section: "providers" | "users") {
    setSettingsSection(section);
    window.history.replaceState(null, "", section === "providers" ? "/settings" : "/settings?section=users");
  }

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      window.localStorage.setItem("mop-agent-sidebar-collapsed", collapsed ? "0" : "1");
      return !collapsed;
    });
  }

  return (
    <MemoryCoreContext.Provider value={{ projects, settingsSection, setSettingsSection }}>
      <div className={`mop-app-frame${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
        <header className="mop-app-topbar">
          <div className="mop-app-brand-cell">
            <a className="mop-app-brand" href="/assistant" aria-label="MOP-AGENT home">
              <img src="/icon.svg" alt="" />
              <span>MOP-AGENT</span>
            </a>
            <button
              className="mop-sidebar-collapse-toggle"
              type="button"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>
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
            <div className="mop-topbar-center">
              <span className="mop-live-dot" />
              <strong>{title}</strong>
            </div>
          </div>
        </header>

        {menuOpen && <button className="mop-sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

        <aside className={`mop-app-sidebar${menuOpen ? " is-open" : ""}`}>
          {isSettings ? (
            <div className="mop-nav-section">
              <p>SETTINGS</p>
              <nav>
                <button className={settingsSection === "providers" ? "is-active" : ""} onClick={() => { selectSection("providers"); setMenuOpen(false); }}>
                  <span className="mop-nav-icon">◇</span>
                  <span>Providers</span>
                </button>
                <button className={settingsSection === "users" ? "is-active" : ""} onClick={() => { selectSection("users"); setMenuOpen(false); }}>
                  <span className="mop-nav-icon">♙</span>
                  <span>Users</span>
                </button>
              </nav>
            </div>
          ) : (
            <>
              <nav className="mop-sidebar-primary" aria-label="Workspace">
                <a href="/assistant" className={pathname.startsWith("/assistant") || pathname.startsWith("/chat/") ? "is-active" : ""} onClick={() => setMenuOpen(false)}>
                  <span className="mop-nav-icon">✎</span>
                  <span>New chat</span>
                </a>
                <a href="/brain" className={pathname.startsWith("/brain") ? "is-active" : ""} onClick={() => setMenuOpen(false)}>
                  <span className="mop-nav-icon">◉</span>
                  <span>Brain</span>
                </a>
              </nav>

              {isAdmin && (
                <div className="mop-nav-section mop-admin-nav">
                  <p>ADMIN</p>
                  <nav>
                    <a href="/settings" onClick={() => setMenuOpen(false)}>
                      <span className="mop-nav-icon">⚙</span>
                      <span>Settings</span>
                    </a>
                  </nav>
                </div>
              )}
            </>
          )}

          <div className="mop-sidebar-spacer" />
          {isSettings && (
            <a href="/assistant" className="mop-back-workspace-btn" onClick={() => setMenuOpen(false)}>
              <span>← BACK TO WORKSPACE</span>
            </a>
          )}
          <button
            className="mop-account-card"
            type="button"
            onClick={() => { setAccountDrawerOpen(true); setMenuOpen(false); }}
            title="Open profile"
            aria-controls="mop-account-drawer"
            aria-expanded={accountDrawerOpen}
          >
            <span className="mop-account-avatar">{viewer.name.slice(0, 1).toUpperCase()}</span>
            <span className="mop-account-copy">
              <strong>{viewer.name}</strong>
              <small>{isAdmin ? "Administrator" : "Member"}</small>
            </span>
            <span aria-hidden="true">•••</span>
          </button>
        </aside>

        <main className="mop-app-main">{children}</main>

        {accountDrawerOpen && (
          <>
            <button className="mop-account-drawer-scrim" type="button" aria-label="Close profile drawer" onClick={() => setAccountDrawerOpen(false)} />
            <aside id="mop-account-drawer" className="mop-account-drawer" role="dialog" aria-modal="true" aria-labelledby="mop-account-drawer-title">
              <header className="mop-account-drawer-header">
                <div>
                  <span>ACCOUNT</span>
                  <strong id="mop-account-drawer-title">Profile</strong>
                </div>
                <button type="button" aria-label="Close profile drawer" title="Close" onClick={() => setAccountDrawerOpen(false)}>×</button>
              </header>

              <div className="mop-account-drawer-profile">
                <span className="mop-account-drawer-avatar">{viewer.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{viewer.name}</strong>
                  <span>{viewer.email}</span>
                </div>
              </div>

              <dl className="mop-account-drawer-details">
                <div><dt>Access level</dt><dd>{isAdmin ? "Administrator" : "Member"}</dd></div>
                <div><dt>Workspace</dt><dd>MOP-AGENT</dd></div>
              </dl>

              <div className="mop-account-drawer-spacer" />
              <button className="mop-account-logout" type="button" onClick={logout}>
                <span>↪</span>
                <strong>Logout</strong>
              </button>
            </aside>
          </>
        )}
      </div>
    </MemoryCoreContext.Provider>
  );
}
