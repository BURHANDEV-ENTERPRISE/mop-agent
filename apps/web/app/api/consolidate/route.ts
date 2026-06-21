/** POST /api/consolidate — owner-triggered episodic→semantic consolidation. */
import { requireRole } from "@/lib/authz";
import { consolidate } from "@/lib/brain/consolidate";

export async function POST(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const result = await consolidate();
  return Response.json(result);
}
