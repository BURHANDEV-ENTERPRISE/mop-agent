/** POST /api/consolidate — owner-triggered episodic→semantic consolidation. */
import { auth } from "@/lib/auth";
import { consolidate } from "@/lib/brain/consolidate";

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await consolidate();
  return Response.json(result);
}
