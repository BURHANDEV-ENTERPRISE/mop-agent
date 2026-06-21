/**
 * GET  /api/skills — list procedural skills (owner).
 * POST /api/skills — add a skill { name, description, body, sourceProjects? } (owner).
 */
import { auth } from "@/lib/auth";
import { addSkill, listSkills } from "@/lib/brain/skills";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ skills: listSkills() });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { name: string; description: string; body: string; sourceProjects?: string[] };
  if (!body?.name || !body?.body) {
    return Response.json({ error: "missing_name_or_body" }, { status: 400 });
  }
  const id = await addSkill({ name: body.name, description: body.description ?? "", body: body.body, sourceProjects: body.sourceProjects });
  return Response.json({ id });
}
