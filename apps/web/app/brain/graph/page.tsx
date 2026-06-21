"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

type MemoryNodeType = "main" | "project" | "pattern" | "skill";
type GNode = { id: string; label: string; type: MemoryNodeType };
type GEdge = { from: string; to: string };
type MemoryNodeData = { label: string; memoryType: MemoryNodeType };

const COLORS: Record<MemoryNodeType, string> = {
  main: "#e4b83f",
  project: "#d74c45",
  pattern: "#4fa676",
  skill: "#4d91c9",
};

const nodeTypes = { memory: MemoryGraphNode };

export default function GraphPage() {
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[] }>({ nodes: [], edges: [] });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<MemoryNodeType, boolean>>({ main: true, project: true, pattern: true, skill: true });
  const [selected, setSelected] = useState<GNode | null>(null);
  const [labelsVisible, setLabelsVisible] = useState(true);

  useEffect(() => {
    fetch("/api/graph")
      .then((response) => response.json())
      .then((result) => setData({ nodes: result.nodes ?? [], edges: result.edges ?? [] }))
      .catch(() => {});
  }, []);

  const visibleData = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const directMatches = new Set(
      data.nodes
        .filter((node) => filters[node.type] && (!normalizedQuery || node.label.toLowerCase().includes(normalizedQuery)))
        .map((node) => node.id),
    );
    if (normalizedQuery && directMatches.size) directMatches.add("main-brain");
    return data.nodes.filter((node) => filters[node.type] && (!normalizedQuery || directMatches.has(node.id)));
  }, [data.nodes, filters, query]);

  const nodes: Node<MemoryNodeData>[] = useMemo(() => {
    const grouped = new Map<MemoryNodeType, GNode[]>();
    for (const type of ["main", "project", "pattern", "skill"] as const) {
      grouped.set(type, visibleData.filter((node) => node.type === type));
    }
    return visibleData.map((node) => {
      if (node.type === "main") {
        return { id: node.id, type: "memory", position: { x: 0, y: 0 }, data: { label: node.label, memoryType: node.type } };
      }
      const peers = grouped.get(node.type) ?? [];
      const index = peers.findIndex((peer) => peer.id === node.id);
      const radius = node.type === "project" ? 250 : node.type === "pattern" ? 430 : 590;
      const phase = node.type === "project" ? 0 : node.type === "pattern" ? 0.35 : 0.7;
      const angle = phase + (Math.PI * 2 * Math.max(index, 0)) / Math.max(peers.length, 1);
      return {
        id: node.id,
        type: "memory",
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: { label: node.label, memoryType: node.type },
      };
    });
  }, [visibleData]);

  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const edges: Edge[] = useMemo(
    () => data.edges
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge, index) => ({
        id: `edge-${index}-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        style: { stroke: "rgba(215, 210, 190, .24)", strokeWidth: edge.from === "main-brain" ? 1.25 : .75 },
      })),
    [data.edges, nodeIds],
  );

  const onNodeClick: NodeMouseHandler = (_, node) => {
    setSelected(data.nodes.find((item) => item.id === node.id) ?? null);
  };

  return (
    <main className={`mop-graph-view${labelsVisible ? " show-labels" : " hide-labels"}`}>
      <header className="mop-graph-toolbar">
        <div className="mop-graph-toolbar-left">
          <a href="/brain" aria-label="Back to Brain">←</a>
          <strong>Graph view</strong>
          <span>{nodes.length} nodes · {edges.length} links</span>
        </div>
        <label className="mop-graph-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memory graph" />
        </label>
        <button type="button" onClick={() => setLabelsVisible((visible) => !visible)}>{labelsVisible ? "Hide labels" : "Show labels"}</button>
      </header>

      <div className="mop-graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: .22 }}
          minZoom={0.08}
          maxZoom={2.4}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(255,255,255,.08)" gap={28} size={1} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => COLORS[(node.data as MemoryNodeData).memoryType]}
            maskColor="rgba(14,15,15,.72)"
            style={{ background: "#171918", border: "1px solid rgba(255,255,255,.12)" }}
          />
          <Controls showInteractive={false} />
        </ReactFlow>

        <aside className="mop-graph-filters">
          <strong>Graph filters</strong>
          {(["main", "project", "pattern", "skill"] as const).map((type) => (
            <label key={type}>
              <input type="checkbox" checked={filters[type]} onChange={() => setFilters((current) => ({ ...current, [type]: !current[type] }))} />
              <span style={{ background: COLORS[type] }} />
              {type === "main" ? "Main Brain" : `${type.charAt(0).toUpperCase()}${type.slice(1)}s`}
            </label>
          ))}
        </aside>

        {selected && (
          <aside className="mop-graph-inspector">
            <button type="button" aria-label="Close inspector" onClick={() => setSelected(null)}>×</button>
            <span style={{ background: COLORS[selected.type] }} />
            <small>{selected.type === "main" ? "CENTRAL MEMORY" : selected.type.toUpperCase()}</small>
            <strong>{selected.label}</strong>
            <p>{selected.type === "main" ? "Shared semantic memory and the root of every linked project." : "Connected knowledge within MOP MemoryCore."}</p>
          </aside>
        )}
      </div>
    </main>
  );
}

function MemoryGraphNode({ data, selected }: NodeProps<MemoryNodeData>) {
  return (
    <div className={`mop-memory-graph-node is-${data.memoryType}${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="mop-graph-handle" />
      <span className="mop-memory-node-dot" style={{ background: COLORS[data.memoryType] }} />
      <span className="mop-memory-node-label">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="mop-graph-handle" />
    </div>
  );
}
