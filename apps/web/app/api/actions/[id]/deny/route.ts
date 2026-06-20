/** POST /api/actions/[id]/deny — deny a pending write action (owner). */
import { auth } from "@/lib/auth";
import { denyAction } from "@/lib/brain/approvals";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const action = denyAction(id);
  if (!action) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ action });
}
