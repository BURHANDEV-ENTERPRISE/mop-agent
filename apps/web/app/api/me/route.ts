/** GET /api/me — current user + role. */
import { auth, getRole } from "@/lib/auth";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    role: getRole(session.user.id) ?? "member",
  });
}
