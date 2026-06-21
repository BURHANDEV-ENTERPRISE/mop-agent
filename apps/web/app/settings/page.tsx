"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type Section = "providers" | "users";
type Masked = { configured: boolean; provider?: string; model?: string | null; keyHint?: string };
type Member = { id: string; email: string; name: string; role: string };
type Invite = { email: string; role: string; expiresAt: number; usedAt: number | null };

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("providers");
  const [config, setConfig] = useState<Masked>({ configured: false });
  const [env, setEnv] = useState<{ anthropic: boolean; openrouter: boolean }>({ anthropic: false, openrouter: false });
  const [provider, setProvider] = useState<"anthropic" | "openrouter">("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [providerMsg, setProviderMsg] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
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
    fetch("/api/invites").then((r) => (r.ok ? r.json() : { invites: [] })).then((data) => setInvites(data.invites ?? [])).catch(() => {});
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("section");
    if (requested === "users") setSection("users");
    loadProvider();
    loadUsers();
  }, []);

  function chooseSection(next: Section) {
    setSection(next);
    const url = next === "providers" ? "/settings" : "/settings?section=users";
    window.history.replaceState(null, "", url);
  }

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

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setUserMsg("Creating invite…");
    const response = await fetch("/api/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    setUserMsg(response.ok ? `Invite created for ${email}.` : `Unable to invite (error ${response.status}).`);
    if (response.ok) setEmail("");
    loadUsers();
  }

  async function revoke(inviteEmail: string) {
    await fetch(`/api/invites?email=${encodeURIComponent(inviteEmail)}`, { method: "DELETE" });
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
        <aside className="mop-settings-nav mop-panel" aria-label="Settings sections">
          <button className={section === "providers" ? "is-active" : ""} onClick={() => chooseSection("providers")}>
            <span>◇</span><strong>Providers</strong>
          </button>
          <button className={section === "users" ? "is-active" : ""} onClick={() => chooseSection("users")}>
            <span>♙</span><strong>Users</strong>
          </button>
        </aside>

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

              <div style={invitePanel}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Invite a user</h3>
                <form onSubmit={invite} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) 130px auto", gap: 9, marginTop: 13 }} className="mop-user-invite-form">
                  <input placeholder="user@example.com" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
                  <select value={role} onChange={(e) => setRole(e.target.value as "member" | "owner")} style={inputStyle}>
                    <option value="member">Member</option>
                    <option value="owner">Admin</option>
                  </select>
                  <button type="submit" style={primaryButton}>CREATE INVITE</button>
                </form>
                {userMsg && <p style={messageStyle}>{userMsg}</p>}
              </div>

              <h3 style={{ margin: "26px 0 10px", fontSize: 14 }}>Pending invites</h3>
              <div style={{ display: "grid", gap: 7 }}>
                {invites.filter((item) => !item.usedAt).map((item) => (
                  <div key={item.email} style={inviteRow}>
                    <span><strong>{item.email}</strong><small style={{ ...muted, marginLeft: 8 }}>{item.role === "owner" ? "admin" : "member"}</small></span>
                    <button onClick={() => revoke(item.email)} style={secondaryButton}>REVOKE</button>
                  </div>
                ))}
                {invites.filter((item) => !item.usedAt).length === 0 && <p style={muted}>No pending invites.</p>}
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
const secondaryButton: CSSProperties = { padding: "6px 10px", border: "1px solid #742220", background: "transparent", color: "#742220", fontSize: 9, fontWeight: 900, cursor: "pointer" };
const messageStyle: CSSProperties = { padding: "9px 11px", borderLeft: "3px solid #742220", background: "rgba(116,34,32,.06)", fontSize: 13 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const miniAvatar: CSSProperties = { width: 28, height: 28, display: "inline-grid", placeItems: "center", marginRight: 9, background: "#2d4a3e", color: "#fef9e1", fontWeight: 900 };
const ownerRole: CSSProperties = { padding: "4px 7px", background: "#742220", color: "#fef9e1", fontSize: 9, fontWeight: 900 };
const memberRole: CSSProperties = { ...ownerRole, color: "#2d4a3e", background: "rgba(45,74,62,.12)" };
const invitePanel: CSSProperties = { marginTop: 26, padding: 16, border: "1px solid rgba(45,74,62,.27)", background: "rgba(254,249,225,.55)" };
const inviteRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 10, border: "1px solid rgba(45,74,62,.22)" };
