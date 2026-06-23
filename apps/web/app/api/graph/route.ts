/**
 * GET /api/graph — Brain knowledge graph (owner).
 * Nodes: projects, semantic notes (Main Brain), skills.
 * Edges: semantic note / skill → each of its source projects.
 */
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { memoryEntry } from "@/lib/db/schema";
import { listProjects } from "@/lib/link/store";
import { listSemanticNotes } from "@/lib/brain/consolidate";
import { listSkills } from "@/lib/brain/skills";
import { ASSISTANT_AGENT, ASSISTANT_PROJECT_ID } from "@/lib/brain/chatMemory";

export type GraphNode = {
  id: string;
  label: string;
  type: "main" | "project" | "pattern" | "skill" | "agent" | "memory";
  size?: number;
  kind?: string;
  detail?: string;
  at?: number;
};
export type GraphEdge = { from: string; to: string };

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const nodes: GraphNode[] = [{ id: "main-brain", label: "Main Brain", type: "main" }];
  const edges: GraphEdge[] = [];

  for (const p of listProjects()) {
    nodes.push({ id: `project:${p.id}`, label: p.name, type: "project" });
    edges.push({ from: "main-brain", to: `project:${p.id}` });
  }

  for (const n of listSemanticNotes()) {
    nodes.push({ id: `pattern:${n.id}`, label: n.title, type: "pattern" });
    edges.push({ from: "main-brain", to: `pattern:${n.id}` });
    for (const pid of n.sourceProjects ?? []) edges.push({ from: `pattern:${n.id}`, to: `project:${pid}` });
  }

  for (const s of listSkills()) {
    nodes.push({ id: `skill:${s.id}`, label: s.name, type: "skill" });
    edges.push({ from: "main-brain", to: `skill:${s.id}` });
    for (const pid of s.sourceProjects ?? []) edges.push({ from: `skill:${s.id}`, to: `project:${pid}` });
  }

  // Central assistant chats live in Main Brain under a MOP-AGENT hub.
  const chatMemories = getDb()
    .select()
    .from(memoryEntry)
    .where(eq(memoryEntry.projectId, ASSISTANT_PROJECT_ID))
    .orderBy(desc(memoryEntry.at))
    .all();
  if (chatMemories.length) {
    nodes.push({ id: "agent:assistant", label: ASSISTANT_AGENT, type: "agent", size: chatMemories.length });
    edges.push({ from: "main-brain", to: "agent:assistant" });
    const seen = new Set<string>();
    for (const m of chatMemories) {
      const key = `${m.kind}|${m.summary}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({
        id: `mem:${m.id}`,
        label: (m.summary || "memory").slice(0, 64),
        type: "memory",
        kind: m.kind,
        detail: (m.body || m.summary || "").slice(0, 320),
        at: m.at,
      });
      edges.push({ from: "agent:assistant", to: `mem:${m.id}` });
    }
  }

  return Response.json({ nodes, edges });
}
