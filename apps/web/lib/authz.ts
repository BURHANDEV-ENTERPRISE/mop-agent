/** Role-based authorization helper (Fasa 7). */
import { auth, getRole } from "./auth";

export type Role = "owner" | "member";

export type AuthzResult =
  | { ok: true; userId: string; role: Role }
  | { ok: false; response: Response };

export async function requireRole(req: Request, roles: Role[]): Promise<AuthzResult> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const role = (getRole(session.user.id) ?? "member") as Role;
  if (!roles.includes(role)) {
    return { ok: false, response: Response.json({ error: "forbidden", needed: roles, have: role }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id, role };
}

/** Any authenticated member. */
export async function requireAuth(req: Request): Promise<AuthzResult> {
  return requireRole(req, ["owner", "member"]);
}
