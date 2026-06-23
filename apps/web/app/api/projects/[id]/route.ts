/**
 * DELETE /api/projects/:id — disconnect a project (owner only).
 * Drops the link + mirror + mirrored memory and closes the live socket. Frees the
 * id so the project can be re-linked with a fresh pairing code.
 */
import { requireRole } from "@/lib/authz";
import { removeProject } from "@/lib/link/store";
import { dropLink } from "@/lib/ws/gateway";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  dropLink(id);
  const removed = removeProject(id);
  if (!removed) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
