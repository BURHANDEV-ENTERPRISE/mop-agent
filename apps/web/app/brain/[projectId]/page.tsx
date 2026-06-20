"use client";
/** Project Brain — overview (state) + recent memory + artifacts, read from mirror. */
import { use, useEffect, useState } from "react";

type Memory = { id: string; kind: string; summary: string; body: string | null; at: number; actor: string | null };
type StateRes = { state: unknown; artifacts: Array<{ path: string }>; memoryCount: number; updatedAt: number };

export default function ProjectBrainPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [mem, setMem] = useState<Memory[]>([]);
  const [info, setInfo] = useState<StateRes | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/memory`).then((r) => r.json()).then((d) => setMem(d.memory ?? [])).catch(() => {});
    fetch(`/api/projects/${projectId}/state`).then((r) => r.json()).then((d) => setInfo(d)).catch(() => {});
  }, [projectId]);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <a href="/brain" style={{ color: "#7aa2ff" }}>← Brain</a>
      <h1 style={{ fontSize: 24 }}>{projectId}</h1>
      <a href={`/chat/${projectId}`} style={{ color: "#7aa2ff" }}>💬 Chat with this project →</a>

      <h2 style={{ fontSize: 16, marginTop: 24, opacity: 0.8 }}>
        Recent memory ({info?.memoryCount ?? mem.length})
      </h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {mem.map((m) => (
          <li key={m.id} style={card}>
            <span style={{ opacity: 0.6 }}>[{m.kind}]</span> {m.summary}
            {m.body && <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>{m.body}</div>}
          </li>
        ))}
        {mem.length === 0 && <p style={{ opacity: 0.5 }}>No memory yet (project may be offline / not synced).</p>}
      </ul>

      <h2 style={{ fontSize: 16, marginTop: 24, opacity: 0.8 }}>Artifacts ({info?.artifacts?.length ?? 0})</h2>
      <ul style={{ opacity: 0.7 }}>
        {(info?.artifacts ?? []).map((a) => <li key={a.path}>{a.path}</li>)}
      </ul>
    </main>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #1f2a3a",
  borderRadius: 8,
  padding: "10px 14px",
  marginBottom: 8,
};
