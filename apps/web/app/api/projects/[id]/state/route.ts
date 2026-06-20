import { auth } from "@/lib/auth";
import { getMirror } from "@/lib/brain/mirror";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const mirror = getMirror(id);
  if (!mirror) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    state: mirror.state,
    artifacts: mirror.artifacts,
    memoryCount: mirror.memoryCount,
    updatedAt: mirror.updatedAt,
  });
}
