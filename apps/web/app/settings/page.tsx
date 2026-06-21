"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useMemoryCore } from "@/components/AppShell";

type Masked = { configured: boolean; provider?: string; model?: string | null; keyHint?: string };
type Member = { id: string; email: string; name: string; role: string };

export default function SettingsPage() {
  const { settingsSection: section } = useMemoryCore();
  const [config, setConfig] = useState<Masked>({ configured: false });
  const [env, setEnv] = useState<{ anthropic: boolean; openrouter: boolean }>({ anthropic: false, openrouter: false });
  const [provider, setProvider] = useState<"anthropic" | "openrouter">("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [providerMsg, setProviderMsg] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [userMsg, setUserMsg] = useState("");

  function loadProvider() {
    fetch("/api/providers").then((r) => r.json()).then((data) => {
      setConfig(data.config ?? { configured: false });
      setEnv(data.env ?? { anthropic: false, openrouter: false });
    }).catch(() => {});
  }

  function loadUsers() {
    fetch("/api/members").then((r) => (r.ok ? r.json() : { members: [] })).then((data) => setMembers(data.members ?? [])).catch(() => {});
  }

  useEffect(() => {
    loadProvider();
    loadUsers();
  }, []);


  async function saveProvider(e: React.FormEvent) {
    e.preventDefault();
    setProviderMsg("Saving…");
    const response = await fetch("/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey, model: model || undefined }),
    });
    const data = await response.json();
    setProviderMsg(response.ok ? "Provider saved. The API key is encrypted." : `Unable to save: ${data.error}`);
    setApiKey("");
    if (response.ok) setConfig(data.config);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setUserMsg("Creating user…");
    const response = await fetch("/api/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: userName, email, password, role }),
    });
    const data = await response.json();
    setUserMsg(response.ok ? `User ${email} created and ready to sign in.` : `Unable to create user: ${data.error ?? response.status}`);
    if (response.ok) {
      setUserName("");
      setEmail("");
      setPassword("");
    }
    loadUsers();
  }

  return (
    <div className="mop-page">
      <header className="mop-page-heading">
        <div>
          <p className="mop-page-kicker">ADMIN CONTROL</p>
          <h1>Settings</h1>
          <p>Configure system-wide AI providers and user access.</p>
        </div>
        <span style={adminBadge}>ADMIN ONLY</span>
      </header>

      <div className="mop-settings-grid">
        <section className="mop-settings-content mop-panel">
          {section === "providers" ? (
            <>
              <div style={sectionHeading}>
                <div>
                  <p className="mop-page-kicker">AI CONNECTION</p>
                  <h2 style={titleStyle}>Providers</h2>
                </div>
                <span style={{ ...statusBadge, color: config.configured ? "#2d4a3e" : "#742220" }}>
                  {config.configured ? "● CONNECTED" : "● OFFLINE DEMO"}
                </span>
              </div>

              <div style={summaryCard}>
                {config.configured ? (
                  <><strong>{config.provider}</strong>{config.model ? ` · ${config.model}` : ""}<span style={muted}> · key {config.keyHint}</span></>
                ) : (
                  <>No provider key saved. Assistant currently uses the offline echo provider.</>
                )}
                <div style={{ ...muted, marginTop: 7, fontSize: 12 }}>
                  Environment: Anthropic {env.anthropic ? "available" : "not set"} · OpenRouter {env.openrouter ? "available" : "not set"}
                </div>
              </div>

              <form onSubmit={saveProvider} style={formGrid}>
                <label style={labelStyle}>Provider
                  <select value={provider} onChange={(e) => setProvider(e.target.value as "anthropic" | "openrouter")} style={inputStyle}>
                    <option value="openrouter">OpenRouter</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>
                <label style={labelStyle}>API key
                  <input placeholder="Paste a new API key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required style={inputStyle} />
                </label>
                <label style={labelStyle}>Model
                  <input placeholder={provider === "anthropic" ? "claude-sonnet-4-6" : "anthropic/claude-sonnet-4.6"} value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle} />
                </label>
                <button type="submit" style={primaryButton}>SAVE PROVIDER</button>
              </form>
              {providerMsg && <p style={messageStyle}>{providerMsg}</p>}
            </>
          ) : (
            <>
              <div style={sectionHeading}>
                <div>
                  <p className="mop-page-kicker">ACCESS CONTROL</p>
                  <h2 style={titleStyle}>Users</h2>
                </div>
                <span style={statusBadge}>{members.length} ACCOUNTS</span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead><tr><th>User</th><th>Email</th><th>Role</th></tr></thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td><span style={miniAvatar}>{(member.name || member.email).slice(0, 1).toUpperCase()}</span>{member.name || "Unnamed"}</td>
                        <td>{member.email}</td>
                        <td><span style={member.role === "owner" ? ownerRole : memberRole}>{member.role === "owner" ? "ADMIN" : "MEMBER"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={userPanel}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Add a user</h3>
                <p style={{ ...muted, margin: "6px 0 0", fontSize: 12 }}>Create the account here, then give the user their email and temporary password.</p>
                <form onSubmit={createUser} style={{ display: "grid", gridTemplateColumns: "minmax(140px,.8fr) minmax(190px,1fr) minmax(150px,.8fr) 110px auto", gap: 9, marginTop: 13 }} className="mop-user-invite-form">
                  <input placeholder="Display name" required value={userName} onChange={(e) => setUserName(e.target.value)} style={inputStyle} />
                  <input placeholder="user@example.com" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
                  <input placeholder="Temporary password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
                  <select value={role} onChange={(e) => setRole(e.target.value as "member" | "owner")} style={inputStyle}>
                    <option value="member">Member</option>
                    <option value="owner">Admin</option>
                  </select>
                  <button type="submit" style={primaryButton}>ADD USER</button>
                </form>
                {userMsg && <p style={messageStyle}>{userMsg}</p>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const adminBadge: CSSProperties = { padding: "7px 10px", color: "#fef9e1", background: "#742220", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 10, fontWeight: 900, letterSpacing: ".12em" };
const sectionHeading: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20, paddingBottom: 15, borderBottom: "1px solid rgba(45,74,62,.24)" };
const titleStyle: CSSProperties = { margin: 0, fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 22 };
const statusBadge: CSSProperties = { padding: "6px 8px", border: "1px solid rgba(45,74,62,.32)", color: "#2d4a3e", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 9, fontWeight: 900, letterSpacing: ".1em" };
const summaryCard: CSSProperties = { padding: 15, border: "1px solid rgba(45,74,62,.24)", background: "rgba(254,249,225,.72)", lineHeight: 1.5 };
const muted: CSSProperties = { color: "rgba(45,74,62,.58)" };
const formGrid: CSSProperties = { display: "grid", gap: 13, marginTop: 20 };
const labelStyle: CSSProperties = { display: "grid", gap: 6, color: "#742220", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 11, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase" };
const inputStyle: CSSProperties = { width: "100%", minHeight: 40, padding: "9px 11px", border: "1px solid rgba(45,74,62,.4)", background: "#fffdf2", color: "#2d4a3e" };
const primaryButton: CSSProperties = { minHeight: 40, padding: "9px 15px", border: "1px solid #742220", background: "#742220", color: "#fef9e1", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 10, fontWeight: 900, cursor: "pointer" };
const messageStyle: CSSProperties = { padding: "9px 11px", borderLeft: "3px solid #742220", background: "rgba(116,34,32,.06)", fontSize: 13 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const miniAvatar: CSSProperties = { width: 28, height: 28, display: "inline-grid", placeItems: "center", marginRight: 9, background: "#2d4a3e", color: "#fef9e1", fontWeight: 900 };
const ownerRole: CSSProperties = { padding: "4px 7px", background: "#742220", color: "#fef9e1", fontSize: 9, fontWeight: 900 };
const memberRole: CSSProperties = { ...ownerRole, color: "#2d4a3e", background: "rgba(45,74,62,.12)" };
const userPanel: CSSProperties = { marginTop: 26, padding: 16, border: "1px solid rgba(45,74,62,.27)", background: "rgba(254,249,225,.55)" };
