/** POST /api/actions/[id]/approve — approve + execute over the live link (owner). */
import { requireRole } from "@/lib/authz";
import { approveAction } from "@/lib/brain/approvals";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const { id } = await params;
  const action = await approveAction(id);
  if (!action) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ action });
}
