/**
 * GET  /api/skills — list procedural skills (owner).
 * POST /api/skills — add a skill { name, description, body, sourceProjects? } (owner).
 */
import { requireAuth, requireRole } from "@/lib/authz";
import { addSkill, listSkills } from "@/lib/brain/skills";

export async function GET(req: Request): Promise<Response> {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  return Response.json({ skills: listSkills() });
}

export async function POST(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as { name: string; description: string; body: string; sourceProjects?: string[] };
  if (!body?.name || !body?.body) {
    return Response.json({ error: "missing_name_or_body" }, { status: 400 });
  }
  const id = await addSkill({ name: body.name, description: body.description ?? "", body: body.body, sourceProjects: body.sourceProjects });
  return Response.json({ id });
}
