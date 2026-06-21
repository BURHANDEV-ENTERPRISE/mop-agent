/** POST /api/actions/[id]/deny — deny a pending write action (owner). */
import { requireRole } from "@/lib/authz";
import { denyAction } from "@/lib/brain/approvals";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const { id } = await params;
  const action = denyAction(id);
  if (!action) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ action });
}
