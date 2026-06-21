"use client";
/** Brain knowledge graph (Fasa 5) — projects ⟷ patterns ⟷ skills, via React Flow. */
import { useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";

type GNode = { id: string; label: string; type: "project" | "pattern" | "skill" };
type GEdge = { from: string; to: string };

const COLOR = { project: "#2b5cff", pattern: "#1a7f4b", skill: "#a15c00" };

export default function GraphPage() {
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    fetch("/api/graph").then((r) => r.json()).then((d) => setData({ nodes: d.nodes ?? [], edges: d.edges ?? [] })).catch(() => {});
  }, []);

  const nodes: Node[] = useMemo(() => {
    const cols: Record<GNode["type"], number> = { project: 0, pattern: 1, skill: 2 };
    const counts: Record<string, number> = {};
    return data.nodes.map((n) => {
      const col = cols[n.type];
      const row = (counts[n.type] = (counts[n.type] ?? 0) + 1);
      return {
        id: n.id,
        position: { x: col * 280, y: row * 90 },
        data: { label: `${n.type === "project" ? "📦" : n.type === "pattern" ? "🌐" : "🛠"} ${n.label}` },
        style: { border: `1px solid ${COLOR[n.type]}`, borderRadius: 8, background: "#111824", color: "#e6edf3", fontSize: 12, width: 240 },
      };
    });
  }, [data.nodes]);

  const edges: Edge[] = useMemo(
    () => data.edges.map((e, i) => ({ id: `e${i}`, source: e.from, target: e.to, style: { stroke: "#2a3a4f" } })),
    [data.edges],
  );

  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px" }}>
        <a href="/brain" style={{ color: "#7aa2ff" }}>← Brain</a>{" "}
        <strong>Knowledge Graph</strong>{" "}
        <span style={{ opacity: 0.6, fontSize: 13 }}>{data.nodes.length} nodes · {data.edges.length} edges</span>
      </div>
      <div style={{ flex: 1 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background color="#1f2a3a" />
          <Controls />
        </ReactFlow>
      </div>
    </main>
  );
}
