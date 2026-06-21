"use client";
/** Grounded chat with a project — streams the answer from /api/chat. */
import { use, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

export default function ChatPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [crossProject, setCrossProject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  async function saveLastToMemory() {
    const last = [...turns].reverse().find((t) => t.role === "assistant")?.content;
    if (!last) return;
    const summary = last.replace(/\s+/g, " ").slice(0, 160);
    const r = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        tool: "append_memory",
        args: { kind: "conversation", actor: "agent", summary, body: last },
        summary: `Save to ${projectId} memory: ${summary.slice(0, 60)}…`,
      }),
    });
    setSaveMsg(r.ok ? "queued for approval → see /brain" : "error");
  }

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", content: message }, { role: "assistant", content: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, message, allowCrossProject: crossProject }),
    });

    if (!res.ok || !res.body) {
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { role: "assistant", content: `[error ${res.status}]` };
        return copy;
      });
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { role: "assistant", content: acc };
        return copy;
      });
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", height: "calc(100vh - 70px)" }}>
      <a href={`/brain/${projectId}`} style={{ color: "#742220" }}>← {projectId}</a>
      <h1 style={{ fontSize: 20 }}>💬 Chat · {projectId}</h1>

      <div style={{ flex: 1, overflowY: "auto", border: "1px solid rgba(45,74,62,.28)", borderRadius: 8, padding: 16, margin: "12px 0", background: "#fffdf2" }}>
        {turns.map((t, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <strong style={{ color: t.role === "user" ? "#2d4a3e" : "#742220" }}>{t.role === "user" ? "you" : "agent"}</strong>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{t.content || "…"}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 13, opacity: 0.7 }}>
          <input type="checkbox" checked={crossProject} onChange={(e) => setCrossProject(e.target.checked)} /> allow cross-project recall
        </label>
        <span style={{ fontSize: 13 }}>
          {saveMsg && <span style={{ opacity: 0.6, marginRight: 8 }}>{saveMsg}</span>}
          <button onClick={saveLastToMemory} disabled={turns.length === 0} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(45,74,62,.32)", background: "#fffdf2", color: "#2d4a3e", cursor: "pointer" }}>
            💾 Save to memory
          </button>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about this project…"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(45,74,62,.32)", background: "#fffdf2", color: "#2d4a3e" }}
        />
        <button onClick={send} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #742220", background: "#742220", color: "#fef9e1", cursor: "pointer" }}>
          {busy ? "…" : "Send"}
        </button>
      </div>
    </main>
  );
}
