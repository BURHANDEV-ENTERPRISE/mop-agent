"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import MemoryGraph, { GRAPH_COLORS, type GEdge, type GNode, type GraphKind } from "./MemoryGraph";

type GraphData = { nodes: GNode[]; edges: GEdge[] };
type Project = { id: string; name: string; status: string; memoryCount: number };

const MAIN_TAB = "main";
const STORAGE_KEY = "mop-graph-tabs";

const MAIN_TYPES: GraphKind[] = ["main", "project", "pattern", "skill"];
const PROJECT_TYPES: GraphKind[] = ["project", "agent", "memory", "skill"];

const TYPE_LABELS: Record<GraphKind, string> = {
  main: "Main Brain",
  project: "Projects",
  agent: "AI agents",
  memory: "Memories",
  pattern: "Patterns",
  skill: "Skills",
};

export default function GraphPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]); // project ids opened as tabs
  const [active, setActive] = useState<string>(MAIN_TAB);

  const [mainData, setMainData] = useState<GraphData | null>(null);
  const [projData, setProjData] = useState<Record<string, GraphData>>({});

  const [query, setQuery] = useState("");
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [filters, setFilters] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<GNode | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkCmd, setLinkCmd] = useState("");
  const [pairError, setPairError] = useState("");
  const [copied, setCopied] = useState(false);

  const seenProjects = useRef<Set<string> | null>(null);

  // ── restore tabs ─────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { openIds?: string[]; active?: string };
        if (Array.isArray(saved.openIds)) setOpenIds(saved.openIds);
        if (typeof saved.active === "string") setActive(saved.active);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ openIds, active }));
    } catch {
      /* ignore */
    }
  }, [openIds, active]);

  // ── poll projects (tab list + auto-open newly linked) ───────────────────────
  useEffect(() => {
    const load = () => {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((result: { projects: Project[] }) => {
          const list = result.projects ?? [];
          setProjects(list);
          const ids = new Set(list.map((p) => p.id));
          // prune tabs for projects that no longer exist
          setOpenIds((current) => current.filter((id) => ids.has(id)));
          // auto-open projects that appear AFTER first load (just linked)
          if (seenProjects.current === null) {
            seenProjects.current = ids;
          } else {
            const fresh = list.filter((p) => !seenProjects.current!.has(p.id));
            if (fresh.length) {
              setOpenIds((current) => Array.from(new Set([...current, ...fresh.map((p) => p.id)])));
              setActive(fresh[fresh.length - 1]!.id);
              setDialogOpen(false);
            }
            seenProjects.current = ids;
          }
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  // ── fetch graph for the active tab (once, cached) ───────────────────────────
  const loadProject = useCallback((id: string) => {
    fetch(`/api/graph/project/${id}`)
      .then((r) => r.json())
      .then((result: GraphData) => setProjData((current) => ({ ...current, [id]: { nodes: result.nodes ?? [], edges: result.edges ?? [] } })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (active === MAIN_TAB) {
      if (!mainData) {
        fetch("/api/graph")
          .then((r) => r.json())
          .then((result: GraphData) => setMainData({ nodes: result.nodes ?? [], edges: result.edges ?? [] }))
          .catch(() => {});
      }
    } else if (!projData[active]) {
      loadProject(active);
    }
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ── active data + center ────────────────────────────────────────────────────
  const activeData: GraphData = active === MAIN_TAB ? mainData ?? { nodes: [], edges: [] } : projData[active] ?? { nodes: [], edges: [] };
  const centerId = active === MAIN_TAB ? "main-brain" : "project";
  const availableTypes = active === MAIN_TAB ? MAIN_TYPES : PROJECT_TYPES;

  // reset filters when the tab's type set changes
  useEffect(() => {
    setFilters(Object.fromEntries(availableTypes.map((t) => [t, true])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const visibleNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = activeData.nodes.filter(
      (node) => (filters[node.type] ?? true) && (!q || node.label.toLowerCase().includes(q)),
    );
    if (q && matches.length) {
      // keep the center node visible as the anchor
      const ids = new Set(matches.map((m) => m.id));
      if (!ids.has(centerId)) {
        const center = activeData.nodes.find((n) => n.id === centerId);
        if (center) matches.push(center);
      }
    }
    return matches;
  }, [activeData.nodes, filters, query, centerId]);

  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    return activeData.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [activeData.edges, visibleNodes]);

  const tabs = useMemo(
    () => [
      { id: MAIN_TAB, label: "Main", closable: false },
      ...openIds.map((id) => ({ id, label: projects.find((p) => p.id === id)?.name ?? id, closable: true })),
    ],
    [openIds, projects],
  );

  // ── actions ─────────────────────────────────────────────────────────────────
  function openTab(id: string) {
    setOpenIds((current) => (current.includes(id) ? current : [...current, id]));
    setActive(id);
  }
  function closeTab(id: string) {
    setOpenIds((current) => current.filter((x) => x !== id));
    setActive((current) => (current === id ? MAIN_TAB : current));
    setProjData((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  function onSelectNode(node: GNode | null) {
    if (node && node.type === "project" && active === MAIN_TAB) {
      const pid = node.id.replace(/^project:/, "");
      openTab(pid);
      return;
    }
    setSelected(node);
  }
  async function generateCode() {
    setLinkCmd("");
    setPairError("");
    setCopied(false);
    try {
      const response = await fetch("/api/link/code", { method: "POST" });
      const result = await response.json();
      if (response.ok) {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        setLinkCmd(`npx mop-flow link ${base}/v1/api/link/${result.code}`);
      } else {
        setPairError(result.error ?? "error");
      }
    } catch {
      setPairError("network_error");
    }
  }

  const onlineCount = projects.filter((p) => p.status === "online").length;

  return (
    <main className={`mop-graph-view${labelsVisible ? " show-labels" : " hide-labels"}`}>
      {/* ── browser-style tab strip ── */}
      <div className="mop-graph-tabs">
        <a href="/brain" className="mop-graph-tabs-back" aria-label="Back to Brain">←</a>
        <div className="mop-graph-tablist" role="tablist">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active === tab.id}
              className={`mop-graph-tab${active === tab.id ? " is-active" : ""}`}
              onClick={() => setActive(tab.id)}
            >
              <span
                className="mop-graph-tab-dot"
                style={{ background: tab.id === MAIN_TAB ? GRAPH_COLORS.main : GRAPH_COLORS.project }}
              />
              <span className="mop-graph-tab-label">{tab.label}</span>
              {tab.closable && (
                <button
                  type="button"
                  className="mop-graph-tab-close"
                  aria-label={`Close ${tab.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" className="mop-graph-tab-add" aria-label="Add project" onClick={() => setDialogOpen(true)}>
            ＋
          </button>
        </div>
        <span className="mop-graph-tabs-meta">{onlineCount}/{projects.length} online</span>
      </div>

      {/* ── contextual toolbar ── */}
      <header className="mop-graph-toolbar">
        <div className="mop-graph-toolbar-left">
          <strong>{active === MAIN_TAB ? "Main Brain" : tabs.find((t) => t.id === active)?.label}</strong>
          <span>{visibleNodes.length} nodes · {visibleEdges.length} links</span>
        </div>
        <label className="mop-graph-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memory graph" />
        </label>
        <button type="button" onClick={() => setLabelsVisible((visible) => !visible)}>
          {labelsVisible ? "Hide labels" : "Show labels"}
        </button>
      </header>

      {/* ── canvas ── */}
      <div className="mop-graph-canvas">
        {visibleNodes.length === 0 ? (
          <div className="mop-graph-blank">
            <strong>{active === MAIN_TAB ? "Main Brain is empty" : "No memory yet"}</strong>
            <p>{active === MAIN_TAB ? "Link a project to grow the graph." : "Memories appear here as this project syncs."}</p>
          </div>
        ) : (
          <MemoryGraph
            key={active}
            nodes={visibleNodes}
            edges={visibleEdges}
            centerId={centerId}
            labelsVisible={labelsVisible}
            onSelect={onSelectNode}
          />
        )}

        <aside className="mop-graph-filters">
          <strong>Graph filters</strong>
          {availableTypes.map((type) => (
            <label key={type}>
              <input
                type="checkbox"
                checked={filters[type] ?? true}
                onChange={() => setFilters((current) => ({ ...current, [type]: !(current[type] ?? true) }))}
              />
              <span style={{ background: GRAPH_COLORS[type] }} />
              {TYPE_LABELS[type]}
            </label>
          ))}
        </aside>

        {selected && (
          <aside className="mop-graph-inspector">
            <button type="button" aria-label="Close inspector" onClick={() => setSelected(null)}>×</button>
            <span style={{ background: GRAPH_COLORS[selected.type] }} />
            <small>{(selected.kind ?? selected.type).toUpperCase()}</small>
            <strong>{selected.label}</strong>
            <p>{selected.detail || describe(selected.type)}</p>
          </aside>
        )}
      </div>

      {/* ── Add Project dialog ── */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="mop-link-dialog-overlay" />
          <Dialog.Content className="mop-link-dialog" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Dialog.Title>Link a project</Dialog.Title>
            <Dialog.Description>
              Generate a one-time pairing code, then run the command inside your MOP-FLOW project. The new tab opens automatically once it connects.
            </Dialog.Description>

            {!linkCmd ? (
              <button type="button" className="mop-link-dialog-generate" onClick={generateCode}>
                ＋ Generate pairing code
              </button>
            ) : (
              <div className="mop-link-dialog-cmd">
                <code>{linkCmd}</code>
                <div className="mop-link-dialog-cmd-actions">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(linkCmd).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      });
                    }}
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                  <button type="button" onClick={generateCode}>New code</button>
                </div>
                <small>One-time code · expires in 10 min · waiting for the project to connect…</small>
              </div>
            )}
            {pairError && <small className="mop-link-dialog-error">Error: {pairError}</small>}

            <Dialog.Close asChild>
              <button type="button" className="mop-link-dialog-cancel">Cancel</button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function describe(type: GraphKind): string {
  switch (type) {
    case "main":
      return "Shared semantic memory and the root of every linked project.";
    case "project":
      return "A linked MOP-FLOW project feeding context into the Brain.";
    case "agent":
      return "An AI agent (memory author) working inside this project.";
    case "memory":
      return "An episodic memory captured from this project.";
    case "skill":
      return "A reusable skill promoted from project work.";
    case "pattern":
      return "A semantic pattern consolidated into Main Brain.";
    default:
      return "Connected knowledge within MOP MemoryCore.";
  }
}
