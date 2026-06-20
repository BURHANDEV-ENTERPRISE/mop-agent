/** GET /api/semantic — list Main Brain semantic notes (owner-only). */
import { auth } from "@/lib/auth";
import { listSemanticNotes } from "@/lib/brain/consolidate";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ notes: listSemanticNotes() });
}
