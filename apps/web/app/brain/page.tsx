"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [pairInfo, setPairInfo] = useState<{ pairingKey: string; projectLinkId: string } | null>(null);
  const [pairError, setPairError] = useState("");
  const [notes, setNotes] = useState<SemanticNote[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateMsg, setConsolidateMsg] = useState("");

  const memoryTotal = useMemo(() => projects.reduce((total, project) => total + project.memoryCount, 0), [projects]);
  const onlineTotal = useMemo(() => projects.filter((project) => project.status === "online").length, [projects]);

  function loadNotes() {
    fetch("/api/semantic").then((response) => response.json()).then((result) => setNotes(result.notes ?? [])).catch(() => {});
  }
  function loadActions() {
    fetch("/api/actions").then((response) => response.json()).then((result) => setActions(result.actions ?? [])).catch(() => {});
  }

  useEffect(() => {
    const load = () => {
      fetch("/api/projects")
        .then((response) => response.json())
        .then((result: { projects: Project[] }) => setProjects(result.projects ?? []))
        .catch(() => {});
      loadActions();
    };
    load();
    loadNotes();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  async function decide(id: string, decision: "approve" | "deny") {
    await fetch(`/api/actions/${id}/${decision}`, { method: "POST" });
    loadActions();
  }

  async function generateCode() {
    setPairInfo(null);
    setPairError("");
    const response = await fetch("/api/gateway/projects", { method: "POST" });
    const result = await response.json();
    if (response.ok) {
      setPairInfo({ pairingKey: result.pairingKey, projectLinkId: result.projectLinkId });
    } else {
      setPairError(result.error ?? "gateway_error");
    }
  }

  async function consolidate() {
    setConsolidating(true);
    setConsolidateMsg("Consolidating project memory…");
    const response = await fetch("/api/consolidate", { method: "POST" });
    const result = await response.json();
    setConsolidateMsg(response.ok
      ? `${result.scanned} memories scanned · ${result.notesCreated} patterns promoted`
      : `Unable to consolidate: ${result.error}`);
    setConsolidating(false);
    loadNotes();
  }

  return (
    <main className="mop-page mop-brain-page">
      <header className="mop-page-heading mop-brain-heading">
        <div>
          <p className="mop-page-kicker">MEMORY WORKSPACE</p>
          <h1>Brain</h1>
          <p>Main Brain is the shared memory core. Projects feed it context, patterns and skills.</p>
        </div>
        <a href="/brain/graph" className="mop-primary-link">GRAPH VIEW <span>↗</span></a>
      </header>

      <section className="mop-main-brain mop-panel">
        <div className="mop-main-brain-orbit" aria-hidden="true">
          <span className="mop-main-brain-core">M</span>
          <i /><i /><i />
        </div>
        <div className="mop-main-brain-copy">
          <p className="mop-page-kicker">PRIMARY KNOWLEDGE LAYER</p>
          <h2>Main Brain</h2>
          <p>Semantic memory shared across every conversation and linked project. Consolidation promotes recurring episodic knowledge into this core.</p>
          <div className="mop-main-brain-actions">
            <button type="button" onClick={consolidate} disabled={consolidating}>{consolidating ? "CONSOLIDATING…" : "⟳ CONSOLIDATE MEMORY"}</button>
            <a href="/brain/graph">Explore connections →</a>
          </div>
          {consolidateMsg && <p className="mop-brain-message">{consolidateMsg}</p>}
        </div>
        <div className="mop-main-brain-stats">
          <div><strong>{notes.length}</strong><span>Semantic patterns</span></div>
          <div><strong>{memoryTotal}</strong><span>Project memories</span></div>
          <div><strong>{onlineTotal}/{projects.length}</strong><span>Projects online</span></div>
        </div>
      </section>

      <section className="mop-brain-linker mop-panel">
        <div>
          <strong>Connect another project</strong>
          <span>Generate a one-time pairing code for MOP-FLOW.</span>
        </div>
        <button type="button" onClick={generateCode}>＋ LINK PROJECT</button>
        {pairInfo && (
          <div className="mop-pair-info">
            <code>mop-flow link --key {pairInfo.pairingKey}</code>
            <small>Channel: {pairInfo.projectLinkId}</small>
          </div>
        )}
        {pairError && <small className="mop-pair-error">Error: {pairError}</small>}
      </section>

      <div className="mop-brain-columns">
        <section className="mop-panel mop-brain-section">
          <header>
            <div><p className="mop-page-kicker">SEMANTIC MEMORY</p><h2>Knowledge patterns</h2></div>
            <span>{notes.length}</span>
          </header>
          {notes.length === 0 ? (
            <div className="mop-brain-empty"><strong>No patterns yet</strong><p>Link projects and consolidate memory to grow Main Brain.</p></div>
          ) : (
            <ul className="mop-brain-note-list">
              {notes.map((note) => (
                <li key={note.id}>
                  <span className="mop-brain-note-dot" />
                  <div><strong>{note.title}</strong><p>{note.body}</p><small>{note.confidence}% confidence · {note.sourceProjects.length} sources</small></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mop-panel mop-brain-section">
          <header>
            <div><p className="mop-page-kicker">CONNECTED CONTEXT</p><h2>Projects</h2></div>
            <span>{projects.length}</span>
          </header>
          {projects.length === 0 ? (
            <div className="mop-brain-empty"><strong>No linked projects</strong><p>Use Link Project above to connect the first memory source.</p></div>
          ) : (
            <ul className="mop-brain-project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <span className={`mop-project-status is-${project.status}`} />
                  <div><a href={`/brain/${project.id}`}>{project.name}</a><small>{project.memoryCount} memories · {project.artifactCount} artifacts</small></div>
                  <a href={`/chat/${project.id}`}>CHAT →</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {actions.length > 0 && (
        <section className="mop-panel mop-brain-approvals">
          <header><div><p className="mop-page-kicker">HUMAN GATE</p><h2>Pending actions</h2></div><span>{actions.filter((action) => action.status === "pending").length} pending</span></header>
          <ul>
            {actions.map((action) => (
              <li key={action.id}>
                <div><code>{action.tool}</code><strong>{action.summary}</strong><small>{action.projectId} · {action.status}{action.error ? ` · ${action.error}` : ""}</small></div>
                {action.status === "pending" && <div><button type="button" onClick={() => decide(action.id, "approve")}>APPROVE</button><button type="button" onClick={() => decide(action.id, "deny")}>DENY</button></div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
