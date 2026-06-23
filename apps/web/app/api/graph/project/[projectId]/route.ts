/**
 * GET /api/graph/project/:projectId — one project's full knowledge graph.
 *
 * Center = the project. Around it: AI agents (distinct memory `actor`s, sized by
 * how many memories they hold), each agent's memories, and the skills sourced
 * from this project. This is the per-project (Obsidian-style) graph tab.
 */
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { memoryEntry } from "@/lib/db/schema";
import { listProjects } from "@/lib/link/store";
import { listSkills } from "@/lib/brain/skills";

export type ProjectGraphNode = {
  id: string;
  label: string;
  type: "project" | "agent" | "memory" | "skill";
  /** relative weight — memory count for agents (drives node size) */
  size?: number;
  kind?: string;
  detail?: string;
  at?: number;
};
export type ProjectGraphEdge = { from: string; to: string };

/** Cap so a huge project doesn't blow up the force layout. */
const MEMORY_LIMIT = 250;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { projectId } = await ctx.params;
  const project = listProjects().find((p) => p.id === projectId);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  const memories = getDb()
    .select()
    .from(memoryEntry)
    .where(eq(memoryEntry.projectId, projectId))
    .orderBy(desc(memoryEntry.at))
    .limit(MEMORY_LIMIT)
    .all();

  const nodes: ProjectGraphNode[] = [
    { id: "project", label: project.name, type: "project" },
  ];
  const edges: ProjectGraphEdge[] = [];

  // Agents = distinct actors; count memories per agent for sizing.
  const agentCount = new Map<string, number>();
  for (const m of memories) {
    const actor = (m.actor && m.actor.trim()) || "unknown";
    agentCount.set(actor, (agentCount.get(actor) ?? 0) + 1);
  }
  for (const [actor, count] of agentCount) {
    nodes.push({ id: `agent:${actor}`, label: actor, type: "agent", size: count });
    edges.push({ from: "project", to: `agent:${actor}` });
  }

  // Memory nodes hang off their agent.
  for (const m of memories) {
    const actor = (m.actor && m.actor.trim()) || "unknown";
    nodes.push({
      id: `mem:${m.id}`,
      label: (m.summary || m.kind || "memory").slice(0, 64),
      type: "memory",
      kind: m.kind,
      detail: (m.body || m.summary || "").slice(0, 320),
      at: m.at,
    });
    edges.push({ from: `agent:${actor}`, to: `mem:${m.id}` });
  }

  // Skills sourced from this project.
  for (const s of listSkills()) {
    if (!(s.sourceProjects ?? []).includes(projectId)) continue;
    nodes.push({ id: `skill:${s.id}`, label: s.name, type: "skill", detail: s.description });
    edges.push({ from: "project", to: `skill:${s.id}` });
  }

  return Response.json({
    project: { id: project.id, name: project.name, status: project.status },
    nodes,
    edges,
  });
}
