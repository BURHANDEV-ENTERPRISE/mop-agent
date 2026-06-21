"use client";
/** Brain dashboard — project list with status + links into each Project Brain. */
import { useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  status: string;
  memoryCount: number;
  artifactCount: number;
  mopFlowVersion?: string;
};

type SemanticNote = { id: string; title: string; body: string; sourceProjects: string[]; confidence: number };
type Action = { id: string; projectId: string; tool: string; summary: string; status: string; error?: string };

export default function BrainPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [code, setCode] = useState<string>("");
  const [notes, setNotes] = useState<SemanticNote[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateMsg, setConsolidateMsg] = useState("");

  function loadNotes() {
    fetch("/api/semantic").then((r) => r.json()).then((d) => setNotes(d.notes ?? [])).catch(() => {});
  }
  function loadActions() {
    fetch("/api/actions").then((r) => r.json()).then((d) => setActions(d.actions ?? [])).catch(() => {});
  }

  useEffect(() => {
    const load = () => {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((d: { projects: Project[] }) => setProjects(d.projects))
        .catch(() => {});
      loadActions();
    };
    load();
    loadNotes();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  async function decide(id: string, what: "approve" | "deny") {
    await fetch(`/api/actions/${id}/${what}`, { method: "POST" });
    loadActions();
  }

  async function genCode() {
    const r = await fetch("/api/link/code", { method: "POST" });
    const d = await r.json();
    setCode(r.ok ? d.code : `error: ${d.error}`);
  }

  async function runConsolidate() {
    setConsolidating(true);
    setConsolidateMsg("…");
    const r = await fetch("/api/consolidate", { method: "POST" });
    const d = await r.json();
    setConsolidateMsg(
      r.ok ? `scanned ${d.scanned} memories → ${d.notesCreated} pattern(s) promoted` : `error: ${d.error}`,
    );
    setConsolidating(false);
    loadNotes();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <p style={{ margin: 0 }}><a href="/assistant" style={{ color: "#742220" }}>← Assistant</a></p>
      <h1 style={{ fontSize: 24 }}>🧠 Brain</h1>
      <p style={{ opacity: 0.65 }}>
        Main Brain + linked project brains. <a href="/brain/graph" style={{ color: "#742220" }}>🕸 Knowledge graph →</a>{" "}
        <a href="/settings" style={{ color: "#742220" }}>⚙️ Settings →</a>{" "}
        <a href="/team" style={{ color: "#742220" }}>👥 Team →</a>
      </p>

      <div style={{ margin: "20px 0", display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={genCode} style={btn}>+ Link project</button>
        {code && (
          <code style={{ background: "#fffdf2", padding: "6px 10px", borderRadius: 6 }}>
            mop-flow-dev link --url {typeof window !== "undefined" ? window.location.origin : ""} --code {code} --project &lt;id&gt;
          </code>
        )}
      </div>

      <section style={{ margin: "8px 0 24px", border: "1px solid rgba(45,74,62,.28)", borderRadius: 8, padding: 16, background: "#fffdf2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0, opacity: 0.85 }}>🌐 Main Brain ({notes.length})</h2>
          <button onClick={runConsolidate} disabled={consolidating} style={{ ...btn, background: "#2d4a3e", borderColor: "#2d4a3e" }}>
            {consolidating ? "consolidating…" : "⟳ Consolidate"}
          </button>
          {consolidateMsg && <span style={{ opacity: 0.65, fontSize: 13 }}>{consolidateMsg}</span>}
        </div>
        <p style={{ opacity: 0.55, fontSize: 13, marginBottom: 8 }}>
          Recurring patterns promoted from project memory (episodic → semantic).
        </p>
        {notes.length === 0 ? (
          <p style={{ opacity: 0.5, fontSize: 13 }}>No patterns yet — link projects, then Consolidate.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {notes.map((n) => (
              <li key={n.id} style={{ padding: "8px 0", borderTop: "1px solid #14202e" }}>
                <strong>{n.title}</strong>{" "}
                <span style={{ opacity: 0.5, fontSize: 12 }}>
                  · {n.confidence}% · {n.sourceProjects.length} project(s)
                </span>
                <div style={{ opacity: 0.65, fontSize: 13, marginTop: 2 }}>{n.body}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {actions.length > 0 && (
        <section style={{ margin: "8px 0 24px", border: "1px solid #3a2f1f", borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px", opacity: 0.85 }}>⚠️ Approvals</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {actions.map((a) => (
              <li key={a.id} style={{ padding: "8px 0", borderTop: "1px solid #2a2415" }}>
                <code style={{ opacity: 0.7 }}>{a.tool}</code> · {a.projectId} — {a.summary}{" "}
                <span style={{ opacity: 0.5, fontSize: 12 }}>[{a.status}{a.error ? `: ${a.error}` : ""}]</span>
                {a.status === "pending" && (
                  <span style={{ float: "right" }}>
                    <button onClick={() => decide(a.id, "approve")} style={{ ...btn, padding: "4px 10px", background: "#2d4a3e", borderColor: "#2d4a3e" }}>Approve</button>{" "}
                    <button onClick={() => decide(a.id, "deny")} style={{ ...btn, padding: "4px 10px", background: "#742220", borderColor: "#742220" }}>Deny</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 style={{ fontSize: 16, opacity: 0.8 }}>Projects ({projects.length})</h2>
      {projects.length === 0 && <p style={{ opacity: 0.5 }}>No projects linked yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {projects.map((p) => (
          <li key={p.id} style={card}>
            <a href={`/brain/${p.id}`} style={{ color: "#742220", textDecoration: "none", fontWeight: 600 }}>
              {p.name}
            </a>
            <span style={{ opacity: 0.6, marginLeft: 8 }}>
              {p.status === "online" ? "🟢 online" : "⚪ offline"} · {p.memoryCount} memories · {p.artifactCount} artifacts
            </span>
            <a href={`/chat/${p.id}`} style={{ float: "right", color: "#742220" }}>chat →</a>
          </li>
        ))}
      </ul>
    </main>
  );
}

const card: React.CSSProperties = {
  border: "1px solid rgba(45,74,62,.28)",
  borderRadius: 8,
  padding: "12px 16px",
  marginBottom: 8,
};
const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #742220",
  background: "#742220",
  color: "#fef9e1",
  cursor: "pointer",
};
