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

type XY = { x: number; y: number };

/** Phyllotaxis (sunflower) disc radius for the j-th leaf around a hub. */
function leafRadius(j: number): number {
  return 38 + Math.sqrt(j) * 17;
}

/**
 * Force-relax just the backbone (project/agents/skills — the non-leaf nodes).
 * Small graph → converges cleanly with classic params, no clamping gymnastics.
 * `pull` scales each hub's distance from centre so its leaf-disc has room.
 */
function relaxBackbone(
  nodes: GNode[],
  edges: GEdge[],
  centerId: string,
  leafCount: Map<string, number>,
): Map<string, XY> {
  const pos = new Map<string, Vec>();
  nodes.forEach((node, i) => {
    if (node.id === centerId) {
      pos.set(node.id, { x: 0, y: 0, vx: 0, vy: 0 });
      return;
    }
    const a = i * 2.399963;
    const r = 150 + i * 30;
    pos.set(node.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 });
  });

  const links = edges.filter((e) => pos.has(e.from) && pos.has(e.to));
  const REPULSION = 26000;
  const SPRING = 0.03;
  const GRAVITY = 0.015;
  const DAMP = 0.85;
  const n = nodes.length;

  for (let iter = 0; iter < 300; iter++) {
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
        a.vx += (f * dx) / d;
        a.vy += (f * dy) / d;
        b.vx -= (f * dx) / d;
        b.vy -= (f * dy) / d;
      }
    }
    for (const e of links) {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      // longer rest length for hubs carrying many leaves, so discs don't collide
      const child = e.to === centerId ? e.from : e.to;
      const linkLen = 120 + leafRadius(leafCount.get(child) ?? 0);
      const f = (d - linkLen) * SPRING;
      a.vx += (f * dx) / d;
      a.vy += (f * dy) / d;
      b.vx -= (f * dx) / d;
      b.vy -= (f * dy) / d;
    }
    for (const node of nodes) {
      const p = pos.get(node.id)!;
      if (node.id === centerId) {
        p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
        continue;
      }
      p.vx -= p.x * GRAVITY;
      p.vy -= p.y * GRAVITY;
      p.vx *= DAMP;
      p.vy *= DAMP;
      if (!Number.isFinite(p.vx)) p.vx = 0;
      if (!Number.isFinite(p.vy)) p.vy = 0;
      p.x += p.vx;
      p.y += p.vy;
      if (!Number.isFinite(p.x)) p.x = 0;
      if (!Number.isFinite(p.y)) p.y = 0;
    }
  }

  // make sure each hub sits far enough out for its leaf-disc to clear the centre
  for (const node of nodes) {
    if (node.id === centerId) continue;
    const leaves = leafCount.get(node.id) ?? 0;
    if (leaves === 0) continue;
    const p = pos.get(node.id)!;
    const dist = Math.hypot(p.x, p.y) || 1;
    const want = leafRadius(leaves) + 120;
    if (dist < want) {
      p.x = (p.x / dist) * want;
      p.y = (p.y / dist) * want;
    }
  }

  const out = new Map<string, XY>();
  for (const [k, v] of pos) out.set(k, { x: Number.isFinite(v.x) ? v.x : 0, y: Number.isFinite(v.y) ? v.y : 0 });
  return out;
}

/**
 * Obsidian-style layout. Leaf nodes (degree-1, e.g. memories) are fanned out in a
 * sunflower disc around their single parent hub rather than thrown into the global
 * force sim — so hundreds of memories read as a tidy halo per agent instead of a
 * blob that collapses onto one point (which also produced NaN edge geometry).
 */
function settle(nodes: GNode[], edges: GEdge[], centerId: string): Map<string, XY> {
  const ids = new Set(nodes.map((n) => n.id));
  const degree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  // map each leaf (degree 1, not the centre) to its single neighbour (its hub)
  const parent = new Map<string, string>();
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    if (e.from !== centerId && degree.get(e.from) === 1) parent.set(e.from, e.to);
    if (e.to !== centerId && degree.get(e.to) === 1) parent.set(e.to, e.from);
  }

  const leafCount = new Map<string, number>();
  for (const hub of parent.values()) leafCount.set(hub, (leafCount.get(hub) ?? 0) + 1);

  const backbone = nodes.filter((n) => !parent.has(n.id));
  const backboneIds = new Set(backbone.map((n) => n.id));
  const backboneEdges = edges.filter((e) => backboneIds.has(e.from) && backboneIds.has(e.to));

  const pos = relaxBackbone(backbone, backboneEdges, centerId, leafCount);

  // fan leaves around their hub in a deterministic golden-angle disc
  const placed = new Map<string, number>();
  for (const node of nodes) {
    const hub = parent.get(node.id);
    if (!hub) continue;
    const hp = pos.get(hub) ?? { x: 0, y: 0 };
    const j = placed.get(hub) ?? 0;
    placed.set(hub, j + 1);
    const a = j * 2.399963;
    const r = leafRadius(j);
    pos.set(node.id, { x: hp.x + Math.cos(a) * r, y: hp.y + Math.sin(a) * r });
  }

  // final finite guard
  const out = new Map<string, XY>();
  for (const [k, v] of pos) out.set(k, { x: Number.isFinite(v.x) ? v.x : 0, y: Number.isFinite(v.y) ? v.y : 0 });
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
    return gNodes.map((node) => {
      const radius = radiusFor(node);
      const pos = positions.get(node.id) ?? { x: 0, y: 0 };
      return {
        id: node.id,
        type: "memory",
        position: { x: Number.isFinite(pos.x) ? pos.x : 0, y: Number.isFinite(pos.y) ? pos.y : 0 },
        // give React Flow the dimensions up front so edge endpoints + the minimap
        // viewBox compute as finite numbers on the very first frame (before the DOM
        // is measured) — otherwise they emit NaN into SVG path/viewBox attributes.
        width: radius,
        height: radius,
        data: { label: node.label, gtype: node.type, radius },
      };
    });
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
