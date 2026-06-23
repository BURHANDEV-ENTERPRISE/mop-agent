"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useMemoryCore } from "@/components/AppShell";

type Member = { id: string; email: string; name: string; role: string };
type AppId = "telegram" | "discord" | "whatsapp" | "slack" | "webhook";
type AppConfig = { appId: AppId; configured: boolean; enabled: boolean; keyHint: string; updatedAt: number };

type ProviderMeta = {
  id: string;
  name: string;
  auth: "apikey" | "oauth" | "custom";
  openaiCompatible: boolean;
  baseUrl?: string;
  defaultModel: string;
  keyPlaceholder?: string;
  note?: string;
};
type Slot = {
  id: string;
  provider: string;
  name: string;
  role: "main" | "fallback";
  orderIndex: number;
  authType: string;
  model: string | null;
  baseUrl: string | null;
  keyHint: string | null;
  enabled: boolean;
  connected: boolean;
};

const APP_CATALOG: Array<{ id: AppId; name: string; icon: string; description: string; secretLabel: string; fieldLabel: string; fieldKey: string; runtime: boolean }> = [
  { id: "telegram", name: "Telegram", icon: "✈", description: "Private bot conversations and project-bound chats.", secretLabel: "Bot token", fieldLabel: "Bot username (optional)", fieldKey: "username", runtime: true },
  { id: "discord", name: "Discord", icon: "◈", description: "Guild channels, direct messages and project replies.", secretLabel: "Bot token", fieldLabel: "Application ID (optional)", fieldKey: "applicationId", runtime: true },
  { id: "whatsapp", name: "WhatsApp", icon: "◉", description: "Meta Cloud API account and phone-number configuration.", secretLabel: "Access token", fieldLabel: "Phone number ID", fieldKey: "phoneNumberId", runtime: false },
  { id: "slack", name: "Slack", icon: "⌗", description: "Workspace bot configuration for future channel routing.", secretLabel: "Bot token", fieldLabel: "App ID", fieldKey: "appId", runtime: false },
  { id: "webhook", name: "Webhook", icon: "↗", description: "Signed custom automation endpoint configuration.", secretLabel: "Signing secret", fieldLabel: "Endpoint URL", fieldKey: "endpoint", runtime: false },
];

export default function SettingsPage() {
  const { settingsSection: section } = useMemoryCore();
  const [members, setMembers] = useState<Member[]>([]);
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [userMsg, setUserMsg] = useState("");

  function loadUsers() {
    fetch("/api/members").then((r) => (r.ok ? r.json() : { members: [] })).then((data) => setMembers(data.members ?? [])).catch(() => {});
  }

  useEffect(() => {
    loadUsers();
  }, []);

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
            <ProvidersSettings />
          ) : section === "users" ? (
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
          ) : (
            <AppsSettings />
          )}
        </section>
      </div>
    </div>
  );
}

function authLabel(auth: string): string {
  return auth === "oauth" ? "SUBSCRIPTION" : auth === "custom" ? "CUSTOM URL" : "API KEY";
}

function ProvidersSettings() {
  const [catalog, setCatalog] = useState<ProviderMeta[]>([]);
  const [main, setMain] = useState<Slot | null>(null);
  const [fallbacks, setFallbacks] = useState<Slot[]>([]);

  const [picked, setPicked] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // subscription OAuth flow
  const [oauth, setOauth] = useState<{ state: string; flow: string; role: "main" | "fallback" } | null>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [oauthMsg, setOauthMsg] = useState("");

  const meta = catalog.find((p) => p.id === picked);

  function load() {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data) => {
        setCatalog(data.catalog ?? []);
        setMain(data.main ?? null);
        setFallbacks(data.fallbacks ?? []);
      })
      .catch(() => {});
  }
  useEffect(load, []);

  function pick(id: string) {
    setPicked(id);
    setApiKey(""); setModel(""); setBaseUrl(""); setMsg("");
    setOauth(null); setOauthCode(""); setOauthMsg("");
  }

  async function save(role: "main" | "fallback") {
    setMsg(role === "main" ? "Saving main…" : "Adding fallback…");
    const response = await fetch("/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, provider: picked, apiKey, model: model || undefined, baseUrl: baseUrl || undefined }),
    });
    const data = await response.json();
    if (response.ok) {
      setMain(data.main ?? null);
      setFallbacks(data.fallbacks ?? []);
      setApiKey(""); setModel(""); setBaseUrl("");
      setMsg(role === "main" ? "Saved as main · key encrypted." : "Added to fallback chain.");
    } else {
      setMsg(`Unable to save: ${data.error}`);
    }
  }

  async function beginOAuth(role: "main" | "fallback") {
    setOauthMsg("Opening login…");
    const response = await fetch("/api/providers/oauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: picked, role }),
    });
    const data = await response.json();
    if (!response.ok) { setOauthMsg(`Unable to start: ${data.error}`); return; }
    setOauth({ state: data.state, flow: data.flow, role });
    setOauthMsg("");
    if (typeof window !== "undefined") window.open(data.authUrl, "_blank", "noopener,noreferrer");
  }

  async function completeOAuth() {
    if (!oauth) return;
    setOauthMsg("Linking subscription…");
    const response = await fetch("/api/providers/oauth", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: oauth.state, code: oauthCode.trim() }),
    });
    const data = await response.json();
    if (response.ok) {
      setMain(data.main ?? null);
      setFallbacks(data.fallbacks ?? []);
      setOauth(null); setOauthCode("");
      setOauthMsg("Subscription linked ✓");
    } else {
      setOauthMsg(`Link failed: ${data.error}`);
    }
  }

  async function reconnect(id: string) {
    const response = await fetch("/api/providers/oauth", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await response.json();
    if (response.ok) { setMain(data.main ?? null); setFallbacks(data.fallbacks ?? []); }
  }

  async function patch(body: unknown) {
    const response = await fetch("/api/providers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (response.ok) setFallbacks(data.fallbacks ?? []);
  }
  async function removeSlot(id: string) {
    const response = await fetch("/api/providers", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await response.json();
    if (response.ok) {
      setMain(data.main ?? null);
      setFallbacks(data.fallbacks ?? []);
    }
  }

  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return setDragIndex(null);
    const next = [...fallbacks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved!);
    setFallbacks(next);
    setDragIndex(null);
    patch({ reorder: next.map((s) => s.id) });
  }

  return (
    <>
      <div style={sectionHeading}>
        <div><p className="mop-page-kicker">AI CONNECTION</p><h2 style={titleStyle}>Providers</h2></div>
        <span style={{ ...statusBadge, color: main?.connected ? "#2d4a3e" : "#742220" }}>
          {main?.connected ? "● CONNECTED" : "● OFFLINE DEMO"}
        </span>
      </div>

      {/* ── Active chain: main + ordered fallbacks ── */}
      <div className="mop-provider-card">
        <div className="mop-provider-card-head">
          <div><p className="mop-page-kicker">ACTIVE CHAIN</p><strong>Provider order</strong></div>
          <span style={statusBadge}>{(main ? 1 : 0) + fallbacks.length} IN CHAIN</span>
        </div>
        <p style={cardHint}>The main provider answers first; fallbacks are tried in order when it fails. Drag fallbacks to reorder.</p>

        {main ? (
          <div className="mop-fallback-row" style={{ cursor: "default", marginBottom: 8 }}>
            <span className="mop-fallback-grip" aria-hidden>★</span>
            <span className="mop-fallback-order" style={{ background: "#742220" }}>1</span>
            <div className="mop-fallback-info">
              <strong>{main.name} <span className="mop-provider-auth">{authLabel(main.authType)}</span></strong>
              <small>{main.model ?? "default model"}{main.keyHint ? ` · ${main.keyHint}` : main.authType === "oauth" ? " · not linked" : ""}{main.connected ? "" : " · offline"}</small>
            </div>
            <div className="mop-fallback-actions">
              {main.authType === "oauth" && <button type="button" className="mop-fallback-toggle" onClick={() => reconnect(main.id)}>RECONNECT</button>}
              <button type="button" className="mop-fallback-remove" onClick={() => removeSlot(main.id)} aria-label="Remove main">×</button>
            </div>
          </div>
        ) : (
          <div style={emptyFallback}>No main provider yet. Pick one below and choose “Set as main”.</div>
        )}

        {fallbacks.length > 0 && (
          <ul className="mop-fallback-list">
            {fallbacks.map((slot, index) => (
              <li
                key={slot.id}
                className={`mop-fallback-row${dragIndex === index ? " is-dragging" : ""}${slot.enabled ? "" : " is-disabled"}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(index)}
                onDragEnd={() => setDragIndex(null)}
              >
                <span className="mop-fallback-grip" aria-hidden>⠿</span>
                <span className="mop-fallback-order">{index + 1}</span>
                <div className="mop-fallback-info">
                  <strong>{slot.name} <span className="mop-provider-auth">{authLabel(slot.authType)}</span></strong>
                  <small>{slot.model ?? "default model"}{slot.keyHint ? ` · ${slot.keyHint}` : slot.authType === "oauth" ? " · not linked" : ""}</small>
                </div>
                <div className="mop-fallback-actions">
                  {slot.authType === "oauth" && <button type="button" className="mop-fallback-toggle" onClick={() => reconnect(slot.id)} title="Reconnect subscription">↻</button>}
                  <button type="button" className="mop-fallback-toggle" onClick={() => patch({ update: { id: slot.id, enabled: !slot.enabled } })} title={slot.enabled ? "Enabled" : "Disabled"}>
                    {slot.enabled ? "ON" : "OFF"}
                  </button>
                  <button type="button" className="mop-fallback-remove" onClick={() => removeSlot(slot.id)} aria-label="Remove">×</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Provider catalog as cards ── */}
      <div className="mop-provider-card">
        <div className="mop-provider-card-head">
          <div><p className="mop-page-kicker">ADD A PROVIDER</p><strong>Choose a provider</strong></div>
        </div>
        <p style={cardHint}>Tap a card, then set it as your main provider or add it to the fallback chain.</p>

        <div className="mop-provider-grid">
          {catalog.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`mop-provider-pick${picked === p.id ? " is-selected" : ""}`}
              onClick={() => pick(p.id)}
            >
              <strong>{p.name}</strong>
              <span className="mop-provider-auth">{authLabel(p.auth)}</span>
              {p.note && <small>{p.note}</small>}
            </button>
          ))}
        </div>

        {meta && (
          <div className="mop-provider-config">
            {meta.auth === "oauth" ? (
              <>
                <p style={{ ...cardHint, margin: 0 }}>{meta.note}</p>
                {meta.id === "chatgpt-sub" && (
                  <p style={{ ...oauthNote, margin: "2px 0 0" }}>
                    Heads-up: ChatGPT’s login redirects to the local Codex listener (<code>localhost:1455</code>), so it only
                    completes when MOP-AGENT runs where it can catch that callback. Claude logs in with a paste-back code.
                  </p>
                )}
                {!oauth ? (
                  <div className="mop-provider-actions">
                    <button type="button" style={primaryButton} onClick={() => beginOAuth("main")}>CONNECT AS MAIN</button>
                    <button type="button" style={ghostButton} onClick={() => beginOAuth("fallback")}>CONNECT AS FALLBACK</button>
                  </div>
                ) : (
                  <div className="mop-oauth-paste">
                    <p style={{ ...cardHint, margin: 0 }}>A login tab opened. Authorise, copy the code shown on the callback page, then paste it here.</p>
                    <input placeholder="Paste authorization code" value={oauthCode} onChange={(e) => setOauthCode(e.target.value)} style={inputStyle} />
                    <div className="mop-provider-actions">
                      <button type="button" style={primaryButton} disabled={!oauthCode.trim()} onClick={completeOAuth}>COMPLETE LINK</button>
                      <button type="button" style={ghostButton} onClick={() => { setOauth(null); setOauthCode(""); setOauthMsg(""); }}>CANCEL</button>
                    </div>
                  </div>
                )}
                {oauthMsg && <p style={messageStyle}>{oauthMsg}</p>}
              </>
            ) : (
              <>
                <label style={labelStyle}>API key
                  <input placeholder={meta.keyPlaceholder ?? "Paste API key"} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={inputStyle} />
                </label>
                {meta.auth === "custom" && (
                  <label style={labelStyle}>Base URL
                    <input placeholder="https://your-endpoint/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} style={inputStyle} />
                  </label>
                )}
                <label style={labelStyle}>Model
                  <input placeholder={meta.defaultModel || "model id"} value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle} />
                </label>
                <div className="mop-provider-actions">
                  <button type="button" style={primaryButton} onClick={() => save("main")}>SET AS MAIN</button>
                  <button type="button" style={ghostButton} onClick={() => save("fallback")}>＋ ADD AS FALLBACK</button>
                </div>
                {msg && <p style={messageStyle}>{msg}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function AppsSettings() {
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [selected, setSelected] = useState<AppId>("telegram");
  const [secret, setSecret] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const app = APP_CATALOG.find((item) => item.id === selected)!;
  const current = configs.find((config) => config.appId === selected);

  function loadApps() {
    fetch("/api/apps").then((response) => response.json()).then((result) => setConfigs(result.apps ?? [])).catch(() => {});
  }

  useEffect(loadApps, []);

  useEffect(() => {
    setEnabled(current?.enabled ?? true);
    setSecret("");
    setFieldValue("");
    setMessage("");
  }, [selected, current?.enabled]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Saving encrypted configuration…");
    const response = await fetch("/api/apps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appId: selected,
        secret: secret || undefined,
        enabled,
        fields: fieldValue ? { [app.fieldKey]: fieldValue } : undefined,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      setConfigs(result.apps ?? []);
      setSecret("");
      setFieldValue("");
      setMessage(app.runtime ? "Saved. Restart MOP-AGENT to activate this bot runtime." : "Configuration saved securely. Runtime adapter will use it when enabled.");
    } else {
      setMessage(`Unable to save: ${result.error ?? response.status}`);
    }
  }

  return (
    <>
      <div style={sectionHeading}>
        <div><p className="mop-page-kicker">CHANNELS & INTEGRATIONS</p><h2 style={titleStyle}>Apps</h2></div>
        <span style={statusBadge}>{configs.filter((config) => config.enabled).length} ENABLED</span>
      </div>

      <div className="mop-apps-layout">
        <div className="mop-app-catalog">
          {APP_CATALOG.map((item) => {
            const config = configs.find((entry) => entry.appId === item.id);
            return (
              <button type="button" key={item.id} className={selected === item.id ? "is-active" : ""} onClick={() => setSelected(item.id)}>
                <span>{item.icon}</span>
                <div><strong>{item.name}</strong><small>{config?.configured ? (config.enabled ? "CONFIGURED · ENABLED" : "CONFIGURED · PAUSED") : "NOT CONFIGURED"}</small></div>
                <i className={config?.enabled ? "is-online" : ""} />
              </button>
            );
          })}
        </div>

        <form className="mop-app-config-panel" onSubmit={save}>
          <header><span>{app.icon}</span><div><h3>{app.name}</h3><p>{app.description}</p></div></header>
          <div className="mop-app-runtime-status">
            <span className={app.runtime ? "is-ready" : ""} />
            {app.runtime ? "Runtime adapter available" : "Configuration registry ready · adapter expansion planned"}
          </div>
          <label style={labelStyle}>{app.secretLabel}
            <input type="password" required={!current?.configured} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={current?.configured ? `Saved key ${current.keyHint} · leave blank to keep` : `Enter ${app.secretLabel.toLowerCase()}`} style={inputStyle} />
          </label>
          <label style={labelStyle}>{app.fieldLabel}
            <input value={fieldValue} onChange={(event) => setFieldValue(event.target.value)} placeholder={current?.configured ? "Leave blank to keep saved value" : app.fieldLabel} style={inputStyle} />
          </label>
          <label className="mop-app-enabled-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Enable this integration</span></label>
          <button type="submit" style={primaryButton}>SAVE {app.name.toUpperCase()}</button>
          {message && <p style={messageStyle}>{message}</p>}
        </form>
      </div>
    </>
  );
}

const adminBadge: CSSProperties = { padding: "7px 10px", color: "#fef9e1", background: "#742220", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 10, fontWeight: 900, letterSpacing: ".12em" };
const sectionHeading: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20, paddingBottom: 15, borderBottom: "1px solid rgba(45,74,62,.24)" };
const titleStyle: CSSProperties = { margin: 0, fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 22 };
const statusBadge: CSSProperties = { padding: "6px 8px", border: "1px solid rgba(45,74,62,.32)", color: "#2d4a3e", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 9, fontWeight: 900, letterSpacing: ".1em" };
const muted: CSSProperties = { color: "rgba(45,74,62,.58)" };
const ghostButton: CSSProperties = { minHeight: 40, padding: "9px 15px", border: "1px solid rgba(116,34,32,.5)", background: "transparent", color: "#742220", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 10, fontWeight: 900, cursor: "pointer" };
const labelStyle: CSSProperties = { display: "grid", gap: 6, color: "#742220", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 11, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase" };
const inputStyle: CSSProperties = { width: "100%", minHeight: 40, padding: "9px 11px", border: "1px solid rgba(45,74,62,.4)", background: "#fffdf2", color: "#2d4a3e" };
const primaryButton: CSSProperties = { minHeight: 40, padding: "9px 15px", border: "1px solid #742220", background: "#742220", color: "#fef9e1", fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 10, fontWeight: 900, cursor: "pointer" };
const messageStyle: CSSProperties = { padding: "9px 11px", borderLeft: "3px solid #742220", background: "rgba(116,34,32,.06)", fontSize: 13 };
const cardHint: CSSProperties = { ...muted, margin: "0 0 4px", fontSize: 12 };
const emptyFallback: CSSProperties = { padding: 14, border: "1px dashed rgba(45,74,62,.32)", background: "rgba(254,249,225,.5)", color: "rgba(45,74,62,.62)", fontSize: 12, lineHeight: 1.5 };
const oauthNote: CSSProperties = { padding: 13, border: "1px solid rgba(116,34,32,.28)", background: "rgba(116,34,32,.05)", color: "#742220", fontSize: 12, lineHeight: 1.5 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const miniAvatar: CSSProperties = { width: 28, height: 28, display: "inline-grid", placeItems: "center", marginRight: 9, background: "#2d4a3e", color: "#fef9e1", fontWeight: 900 };
const ownerRole: CSSProperties = { padding: "4px 7px", background: "#742220", color: "#fef9e1", fontSize: 9, fontWeight: 900 };
const memberRole: CSSProperties = { ...ownerRole, color: "#2d4a3e", background: "rgba(45,74,62,.12)" };
const userPanel: CSSProperties = { marginTop: 26, padding: 16, border: "1px solid rgba(45,74,62,.27)", background: "rgba(254,249,225,.55)" };
