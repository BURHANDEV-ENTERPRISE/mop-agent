"use client";
/** Provider settings — plug an AI key (stored encrypted). */
import { useEffect, useState } from "react";

type Masked = { configured: boolean; provider?: string; model?: string | null; keyHint?: string };

export default function SettingsPage() {
  const [config, setConfig] = useState<Masked>({ configured: false });
  const [env, setEnv] = useState<{ anthropic: boolean; openrouter: boolean }>({ anthropic: false, openrouter: false });
  const [provider, setProvider] = useState<"anthropic" | "openrouter">("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/providers").then((r) => r.json()).then((d) => { setConfig(d.config); setEnv(d.env); }).catch(() => {});
  }
  useEffect(load, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("…");
    const r = await fetch("/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey, model: model || undefined }),
    });
    const d = await r.json();
    setMsg(r.ok ? "✅ saved (key encrypted)" : `error: ${d.error}`);
    setApiKey("");
    if (r.ok) setConfig(d.config);
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "48px 24px" }}>
      <a href="/brain" style={{ color: "#7aa2ff" }}>← Brain</a>
      <h1 style={{ fontSize: 24 }}>⚙️ Provider settings</h1>

      <div style={{ border: "1px solid #1f2a3a", borderRadius: 8, padding: 14, margin: "12px 0", opacity: 0.9 }}>
        {config.configured
          ? <>Active: <strong>{config.provider}</strong>{config.model ? ` · ${config.model}` : ""} · key {config.keyHint}</>
          : "No provider key saved yet — chat uses the offline echo provider."}
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
          env keys: anthropic {env.anthropic ? "✓" : "—"} · openrouter {env.openrouter ? "✓" : "—"} (DB config overrides env)
        </div>
      </div>

      <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
        <select value={provider} onChange={(e) => setProvider(e.target.value as "anthropic" | "openrouter")} style={inp}>
          <option value="openrouter">OpenRouter (any model)</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <input placeholder="API key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required style={inp} />
        <input placeholder={provider === "anthropic" ? "model (e.g. claude-sonnet-4-6)" : "model (e.g. anthropic/claude-sonnet-4.6)"} value={model} onChange={(e) => setModel(e.target.value)} style={inp} />
        <button type="submit" style={btn}>Save</button>
      </form>
      {msg && <p style={{ marginTop: 14, opacity: 0.85 }}>{msg}</p>}
    </main>
  );
}

const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, border: "1px solid #1f2a3a", background: "#111824", color: "#e6edf3" };
const btn: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, border: "1px solid #2b5cff", background: "#2b5cff", color: "white", cursor: "pointer" };
