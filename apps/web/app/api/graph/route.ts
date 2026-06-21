/**
 * GET /api/graph — Brain knowledge graph (owner).
 * Nodes: projects, semantic notes (Main Brain), skills.
 * Edges: semantic note / skill → each of its source projects.
 */
import { auth } from "@/lib/auth";
import { listProjects } from "@/lib/link/store";
import { listSemanticNotes } from "@/lib/brain/consolidate";
import { listSkills } from "@/lib/brain/skills";

export type GraphNode = { id: string; label: string; type: "main" | "project" | "pattern" | "skill" };
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

  return Response.json({ nodes, edges });
}
