"use client";

/**
 * MemoryGraph — Obsidian-style force-directed canvas built on React Flow.
 *
 * Generic: feed it nodes + edges + the id of the center node. A deterministic
 * force relaxation lays the graph out organically (center pinned, links pull,
 * everything else repels) so it reads like an Obsidian vault. Nodes stay
 * draggable / pannable / zoomable; the layout only re-runs when the set of
 * nodes actually changes (not on every poll), so drags aren't thrown away.
 */
import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

export type GraphKind = "main" | "project" | "agent" | "memory" | "pattern" | "skill";
export type GNode = {
  id: string;
  label: string;
  type: GraphKind;
  size?: number;
  kind?: string;
  detail?: string;
  at?: number;
};
export type GEdge = { from: string; to: string };

export const GRAPH_COLORS: Record<GraphKind, string> = {
  main: "#e4b83f",
  project: "#d74c45",
  agent: "#b07cd6",
  memory: "#7f8a99",
  pattern: "#4fa676",
  skill: "#4d91c9",
};

type NodeData = { label: string; gtype: GraphKind; radius: number };

function radiusFor(node: GNode): number {
  if (node.type === "main" || node.type === "project") return 26;
  if (node.type === "agent") return 13 + Math.min(node.size ?? 1, 26) * 0.7;
  if (node.type === "memory") return 6;
  return 10; // pattern / skill
}

type Vec = { x: number; y: number; vx: number; vy: number };

/** Synchronous force relaxation → final positions keyed by node id. */
function settle(nodes: GNode[], edges: GEdge[], centerId: string): Map<string, { x: number; y: number }> {
  const pos = new Map<string, Vec>();
  nodes.forEach((node, i) => {
    if (node.id === centerId) {
      pos.set(node.id, { x: 0, y: 0, vx: 0, vy: 0 });
      return;
    }
    // golden-angle seed spiral so the first frame is already spread out
    const a = i * 2.399963;
    const r = 130 + i * 7;
    pos.set(node.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 });
  });

  const links = edges.filter((e) => pos.has(e.from) && pos.has(e.to));
  const REPULSION = 9000;
  const SPRING = 0.025;
  const LINK_LEN = 86;
  const GRAVITY = 0.018;
  const DAMP = 0.85;
  const n = nodes.length;

  for (let iter = 0; iter < 260; iter++) {
    for (let i = 0; i < n; i++) {
      const a = pos.get(nodes[i]!.id)!;
      for (let j = i + 1; j < n; j++) {
        const b = pos.get(nodes[j]!.id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 0.01;
        }
        const d = Math.sqrt(d2);
        const f = REPULSION / d2;
        const fx = (f * dx) / d;
        const fy = (f * dy) / d;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const e of links) {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - LINK_LEN) * SPRING;
      const fx = (f * dx) / d;
      const fy = (f * dy) / d;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (const node of nodes) {
      const p = pos.get(node.id)!;
      if (node.id === centerId) {
        p.x = 0;
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
        continue;
      }
      p.vx -= p.x * GRAVITY;
      p.vy -= p.y * GRAVITY;
      p.vx *= DAMP;
      p.vy *= DAMP;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  const out = new Map<string, { x: number; y: number }>();
  for (const [k, v] of pos) out.set(k, { x: v.x, y: v.y });
  return out;
}

const nodeTypes = { memory: MemoryNode };

export default function MemoryGraph({
  nodes: gNodes,
  edges: gEdges,
  centerId,
  labelsVisible,
  onSelect,
}: {
  nodes: GNode[];
  edges: GEdge[];
  centerId: string;
  labelsVisible: boolean;
  onSelect?: (node: GNode | null) => void;
}) {
  // Re-layout only when the node id set changes (not on every data refresh).
  const signature = useMemo(
    () => gNodes.map((node) => node.id).sort().join("|"),
    [gNodes],
  );

  const initialNodes: Node<NodeData>[] = useMemo(() => {
    const positions = settle(gNodes, gEdges, centerId);
    return gNodes.map((node) => ({
      id: node.id,
      type: "memory",
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: { label: node.label, gtype: node.type, radius: radiusFor(node) },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, centerId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);

  const nodeIds = useMemo(() => new Set(gNodes.map((node) => node.id)), [gNodes]);
  const edges: Edge[] = useMemo(
    () =>
      gEdges
        .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
        .map((edge, index) => ({
          id: `edge-${index}-${edge.from}-${edge.to}`,
          source: edge.from,
          target: edge.to,
          type: "straight",
          style: {
            stroke: "rgba(215, 210, 190, .20)",
            strokeWidth: edge.from === centerId ? 1.1 : 0.7,
          },
        })),
    [gEdges, nodeIds, centerId],
  );

  const onNodeClick: NodeMouseHandler = (_, node) => {
    onSelect?.(gNodes.find((item) => item.id === node.id) ?? null);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={() => onSelect?.(null)}
      fitView
      fitViewOptions={{ padding: 0.24 }}
      minZoom={0.08}
      maxZoom={2.6}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      className={labelsVisible ? "show-labels" : "hide-labels"}
    >
      <Background color="rgba(255,255,255,.07)" gap={28} size={1} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => GRAPH_COLORS[(node.data as NodeData).gtype]}
        maskColor="rgba(14,15,15,.72)"
        style={{ background: "#171918", border: "1px solid rgba(255,255,255,.12)" }}
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function MemoryNode({ data }: NodeProps<NodeData>) {
  const { radius, gtype, label } = data;
  return (
    <div
      className={`mop-memory-graph-node is-${gtype}`}
      style={{ width: radius, height: radius }}
    >
      <Handle type="target" position={Position.Top} className="mop-graph-handle" />
      <span
        className="mop-memory-node-dot"
        style={{ width: radius, height: radius, background: GRAPH_COLORS[gtype] }}
      />
      <span className="mop-memory-node-label">{label}</span>
      <Handle type="source" position={Position.Bottom} className="mop-graph-handle" />
    </div>
  );
}
