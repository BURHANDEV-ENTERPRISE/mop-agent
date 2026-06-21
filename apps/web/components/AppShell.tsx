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
export type ProviderState = { configured: boolean; provider?: string; model?: string | null };

interface MemoryCoreContextType {
  selectedProject: string;
  setSelectedProject: (id: string) => void;
  projects: Project[];
  provider: ProviderState;
  settingsSection: "providers" | "users";
  setSettingsSection: (section: "providers" | "users") => void;
}

const MemoryCoreContext = createContext<MemoryCoreContextType | undefined>(undefined);

export function useMemoryCore() {
  const context = useContext(MemoryCoreContext);
  if (!context) {
    throw new Error("useMemoryCore must be used within a MemoryCoreProvider");
  }
  return context;
}

const selectStyle = { color: "#2d4a3e", border: "1px solid rgba(45,74,62,.42)", padding: "6px 8px", background: "#fffdf2" };


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

  const [projects, setProjects] = useState<Project[]>([]);
  const [provider, setProvider] = useState<ProviderState>({ configured: false });
  const [selectedProject, setSelectedProject] = useState("");
  const [settingsSection, setSettingsSection] = useState<"providers" | "users">("providers");

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/providers").then((r) => r.json()),
    ]).then(([projectData, providerData]) => {
      setProjects(projectData.projects ?? []);
      setProvider(providerData.config ?? { configured: false });
    }).catch(() => {});

    const requested = new URLSearchParams(window.location.search).get("section");
    if (requested === "users") setSettingsSection("users");
  }, []);

  async function logout() {
    await signOut();
    window.location.replace("/login");
  }

  const selectSection = (sec: "providers" | "users") => {
    setSettingsSection(sec);
    const url = sec === "providers" ? "/settings" : "/settings?section=users";
    window.history.replaceState(null, "", url);
  };

  const isSettings = pathname.startsWith("/settings");

  const nav = [
    { href: "/assistant", label: "Assistant", icon: "✦", active: pathname.startsWith("/assistant") || pathname.startsWith("/chat/") },
    { href: "/brain", label: "Brain", icon: "◉", active: pathname.startsWith("/brain") },
  ];

  return (
    <MemoryCoreContext.Provider value={{ selectedProject, setSelectedProject, projects, provider, settingsSection, setSettingsSection }}>
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
            {pathname === "/assistant" ? (
              <div className="mop-assistant-toolbar" style={{ border: 0, padding: 0, margin: 0, background: "transparent", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontFamily: '"SFMono-Regular", Consolas, monospace', color: "#742220" }}>LIVE ASSISTANT</strong>
                  <span style={{ color: "rgba(45,74,62,.62)", marginLeft: 10, fontSize: 12 }}>
                    {provider.configured ? `${provider.provider}${provider.model ? ` · ${provider.model}` : ""}` : "offline demo"}
                  </span>
                </div>
                <label style={{ color: "#2d4a3e", fontSize: 12 }}>
                  MEMORY SCOPE&nbsp;
                  <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} style={selectStyle}>
                    <option value="">All memory</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
              </div>
            ) : (
              <>
                <div className="mop-topbar-title">
                  <span className="mop-live-dot" />
                  <strong>{title}</strong>
                </div>
                <div className="mop-topbar-center">MOP MEMORYCORE</div>
                <div className="mop-topbar-meta">
                  <span>{isAdmin ? "ADMIN" : "MEMBER"}</span>
                  <span className="mop-version">v0.1.10</span>
                </div>
              </>
            )}
          </div>
        </header>

        {menuOpen && <button className="mop-sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

        <aside className={isSettings 
          ? `mop-settings-nav mop-panel mop-settings-sidebar${menuOpen ? " is-open" : ""}` 
          : `mop-app-sidebar${menuOpen ? " is-open" : ""}`}
        >
          {isSettings ? (
            <>
              <button className={settingsSection === "providers" ? "is-active" : ""} onClick={() => { selectSection("providers"); setMenuOpen(false); }}>
                <span>◇</span><strong>Providers</strong>
              </button>
              <button className={settingsSection === "users" ? "is-active" : ""} onClick={() => { selectSection("users"); setMenuOpen(false); }}>
                <span>♙</span><strong>Users</strong>
              </button>
            </>
          ) : (
            <>
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
            </>
          )}

          <div className="mop-sidebar-spacer" />

          {isSettings && (
            <a href="/assistant" className="mop-back-workspace-btn">
              <span>← BACK TO WORKSPACE</span>
            </a>
          )}

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
    </MemoryCoreContext.Provider>
  );
}

