import { auth } from "@/lib/auth";
import { listProjectMemory } from "@/lib/brain/mirror";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return Response.json({ memory: listProjectMemory(id) });
}
