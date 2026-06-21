"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth-client";

type Turn = { role: "user" | "assistant"; content: string };
type Project = { id: string; name: string; status: string };
type ProviderState = { configured: boolean; provider?: string; model?: string | null };

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [provider, setProvider] = useState<ProviderState>({ configured: false });
  const [name, setName] = useState("Admin");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [providerUsed, setProviderUsed] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/providers").then((r) => r.json()),
      fetch("/api/me").then((r) => r.json()),
    ]).then(([projectData, providerData, me]) => {
      setProjects(projectData.projects ?? []);
      setProvider(providerData.config ?? { configured: false });
      setName(me.user?.name || me.user?.email || "Admin");
    }).catch(() => {});
  }, []);

  async function send(prefill?: string) {
    const message = (prefill ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setTurns((current) => [...current, { role: "user", content: message }, { role: "assistant", content: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        projectId: selectedProject || undefined,
        allowCrossProject: !selectedProject,
      }),
    });

    setProviderUsed(res.headers.get("X-Provider") ?? "");
    if (!res.ok || !res.body) {
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = { role: "assistant", content: `Unable to answer (error ${res.status}).` };
        return next;
      });
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      setTurns((current) => {
        const next = [...current];
        next[next.length - 1] = { role: "assistant", content: answer };
        return next;
      });
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    setBusy(false);
  }

  async function logout() {
    await signOut();
    window.location.replace("/setup");
  }

  return (
    <main className="mop-assistant-shell" style={appShell}>
      <aside className="mop-assistant-sidebar" style={sidebar}>
        <a href="/assistant" style={brand}><span style={brandMark}>M</span><strong>MOP-AGENT</strong></a>
        <nav style={{ display: "grid", gap: 6, marginTop: 34 }}>
          <a href="/assistant" style={{ ...navItem, ...navActive }}>✦ Assistant</a>
          <a href="/brain" style={navItem}>◉ Brain</a>
          <a href="/settings" style={navItem}>⚙ Providers</a>
          <a href="/team" style={navItem}>♙ Team</a>
        </nav>

        <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
          {!provider.configured && (
            <a href="/settings" style={setupCard}>
              <strong style={{ color: "#fef9e1" }}>Connect an AI model</strong>
              <span style={{ fontSize: 12, lineHeight: 1.45 }}>Offline demo is active. Add OpenRouter or Anthropic for full answers.</span>
            </a>
          )}
          <button onClick={logout} style={accountButton} title="Sign out">
            <span style={avatar}>{name.slice(0, 1).toUpperCase()}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
            <span style={{ marginLeft: "auto", opacity: .55 }}>↪</span>
          </button>
        </div>
      </aside>

      <section style={workspace}>
        <header style={topbar}>
          <div>
            <strong>Assistant</strong>
            <span style={{ color: "rgba(45,74,62,.68)", marginLeft: 9, fontSize: 12 }}>{provider.configured ? `${provider.provider}${provider.model ? ` · ${provider.model}` : ""}` : "offline demo"}</span>
          </div>
          <label style={{ color: "#2d4a3e", fontSize: 12 }}>
            Memory scope&nbsp;
            <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} style={selectStyle}>
              <option value="">All memory</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
        </header>

        <div style={conversation}>
          {turns.length === 0 ? (
            <div style={welcome}>
              <div style={assistantOrb}>✦</div>
              <p style={{ color: "#742220", fontSize: 12, fontWeight: 800, letterSpacing: ".13em" }}>MOP-AGENT IS READY</p>
              <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", margin: "8px 0 12px" }}>What are we working on, {name.split(" ")[0]}?</h1>
              <p style={{ color: "rgba(45,74,62,.72)", maxWidth: 610, lineHeight: 1.65 }}>
                Start talking immediately. Link projects when you want MOP-AGENT to remember their state and work across them.
              </p>
              <div className="mop-prompt-grid" style={promptGrid}>
                {["Help me plan today’s work", "What can MOP-AGENT do?", "Summarize what you remember", "Plan a new software project"].map((prompt) => (
                  <button key={prompt} onClick={() => send(prompt)} style={promptCard}>{prompt}<span>→</span></button>
                ))}
              </div>
              {projects.length === 0 && (
                <p style={{ fontSize: 13, color: "rgba(45,74,62,.68)", marginTop: 24 }}>
                  No project linked yet—this does not block chat. <a href="/brain" style={{ color: "#742220" }}>Link one from Brain →</a>
                </p>
              )}
            </div>
          ) : (
            <div style={{ width: "min(100%, 820px)", margin: "0 auto", padding: "28px 0 160px" }}>
              {turns.map((turn, index) => (
                <article key={index} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 13, marginBottom: 26 }}>
                  <span style={turn.role === "assistant" ? botAvatar : userAvatar}>{turn.role === "assistant" ? "✦" : name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong style={{ fontSize: 13, color: turn.role === "assistant" ? "#742220" : "#2d4a3e" }}>{turn.role === "assistant" ? "MOP-AGENT" : "You"}</strong>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 6, color: "#2d4a3e" }}>{turn.content || "Thinking…"}</div>
                  </div>
                </article>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div style={composerWrap}>
          <div style={composer}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message MOP-AGENT…" rows={1} style={textarea} />
            <button onClick={() => send()} disabled={busy || !input.trim()} style={{ ...sendButton, opacity: busy || !input.trim() ? .45 : 1 }}>↑</button>
          </div>
          <div style={{ textAlign: "center", color: "rgba(45,74,62,.62)", fontSize: 11, marginTop: 8 }}>
            {providerUsed ? `Answered by ${providerUsed} · ` : ""}{selectedProject ? "Selected project memory" : "Cross-project memory"}
          </div>
        </div>
      </section>
    </main>
  );
}

const appShell: React.CSSProperties = { minHeight: "100vh", display: "grid", gridTemplateColumns: "235px 1fr", background: "#fef9e1" };
const sidebar: React.CSSProperties = { padding: "22px 15px", borderRight: "1px solid #20382f", background: "#2d4a3e", display: "flex", flexDirection: "column", minHeight: "calc(100vh - 44px)" };
const brand: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, color: "#fef9e1", textDecoration: "none", padding: "4px 8px" };
const brandMark: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", background: "#742220", color: "#fef9e1", fontSize: 13 };
const navItem: React.CSSProperties = { color: "rgba(254,249,225,.76)", textDecoration: "none", padding: "10px 12px", borderRadius: 8, fontSize: 14 };
const navActive: React.CSSProperties = { color: "#fef9e1", background: "#742220", boxShadow: "inset 2px 0 #fef9e1" };
const setupCard: React.CSSProperties = { display: "grid", gap: 5, padding: 12, border: "1px solid rgba(254,249,225,.45)", borderRadius: 10, background: "#742220", color: "rgba(254,249,225,.74)", textDecoration: "none" };
const accountButton: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, padding: 8, border: 0, borderRadius: 9, background: "transparent", color: "#fef9e1", cursor: "pointer", textAlign: "left" };
const avatar: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", background: "#742220", color: "#fef9e1", fontSize: 12 };
const workspace: React.CSSProperties = { minWidth: 0, minHeight: "100vh", position: "relative", display: "flex", flexDirection: "column", background: "radial-gradient(circle at 50% 4%, #fffdf2 0, #fef9e1 58%)" };
const topbar: React.CSSProperties = { height: 62, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(45,74,62,.25)", background: "rgba(254,249,225,.88)", backdropFilter: "blur(16px)" };
const selectStyle: React.CSSProperties = { color: "#2d4a3e", border: "1px solid rgba(45,74,62,.38)", borderRadius: 7, padding: "6px 8px", background: "#fffdf2" };
const conversation: React.CSSProperties = { flex: 1, overflowY: "auto", padding: "0 28px" };
const welcome: React.CSSProperties = { minHeight: "calc(100vh - 220px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", paddingBottom: 60 };
const assistantOrb: React.CSSProperties = { width: 58, height: 58, borderRadius: 18, display: "grid", placeItems: "center", fontSize: 24, color: "#fef9e1", background: "#742220", boxShadow: "0 15px 55px rgba(116,34,32,.22)" };
const promptGrid: React.CSSProperties = { width: "min(100%, 650px)", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 28 };
const promptCard: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "14px 15px", borderRadius: 10, border: "1px solid rgba(45,74,62,.3)", background: "#fffdf2", color: "#2d4a3e", cursor: "pointer", textAlign: "left" };
const botAvatar: React.CSSProperties = { width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: "#742220", color: "#fef9e1" };
const userAvatar: React.CSSProperties = { ...botAvatar, background: "#2d4a3e", color: "#fef9e1", fontSize: 12 };
const composerWrap: React.CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, padding: "28px 30px 18px", background: "linear-gradient(transparent,#fef9e1 28%)" };
const composer: React.CSSProperties = { width: "min(calc(100% - 32px), 800px)", margin: "0 auto", display: "flex", alignItems: "flex-end", gap: 10, padding: "10px 10px 10px 15px", border: "1px solid rgba(45,74,62,.42)", borderRadius: 14, background: "#fffdf2", boxShadow: "0 15px 45px rgba(45,74,62,.16)" };
const textarea: React.CSSProperties = { flex: 1, resize: "none", border: 0, outline: 0, background: "transparent", color: "#2d4a3e", font: "inherit", lineHeight: 1.55, padding: "5px 0" };
const sendButton: React.CSSProperties = { width: 34, height: 34, border: 0, borderRadius: 9, background: "#742220", color: "#fef9e1", fontSize: 18, cursor: "pointer" };
