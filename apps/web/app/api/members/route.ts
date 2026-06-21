/** GET/POST /api/members — list users or create a login directly (owner). */
import { auth } from "@/lib/auth";
import { getSqlite } from "@/lib/db/client";
import { requireRole } from "@/lib/authz";

export async function GET(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const members = getSqlite()
    .prepare(
      `SELECT u.id, u.email, u.name, COALESCE(r.role, 'member') AS role
       FROM user u LEFT JOIN app_role r ON r.user_id = u.id
       ORDER BY r.role = 'owner' DESC, u.email`,
    )
    .all();
  return Response.json({ members });
}

export async function POST(req: Request): Promise<Response> {
  const access = await requireRole(req, ["owner"]);
  if (!access.ok) return access.response;

  const body = (await req.json()) as { name?: string; email?: string; password?: string; role?: "member" | "owner" };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const role = body.role === "owner" ? "owner" : "member";
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "invalid_name_or_email" }, { status: 400 });
  }
  if (password.length < 8) return Response.json({ error: "password_too_short" }, { status: 400 });

  const sqlite = getSqlite();
  const exists = sqlite.prepare("SELECT 1 FROM user WHERE lower(email) = lower(?) LIMIT 1").get(email);
  if (exists) return Response.json({ error: "user_already_exists" }, { status: 409 });

  const now = Date.now();
  sqlite.prepare(
    `INSERT INTO invite(email, role, expires_at, used_at, invited_by, created_at)
     VALUES(?, ?, ?, NULL, ?, ?)
     ON CONFLICT(email) DO UPDATE SET role=excluded.role, expires_at=excluded.expires_at,
       used_at=NULL, invited_by=excluded.invited_by`,
  ).run(email, role, now + 10 * 60_000, access.userId, now);

  try {
    await auth.api.signUpEmail({ body: { name, email, password } });
  } catch (error) {
    sqlite.prepare("DELETE FROM invite WHERE email = ? AND used_at IS NULL").run(email);
    const message = error instanceof Error ? error.message : "create_user_failed";
    return Response.json({ error: message }, { status: 400 });
  }

  return Response.json({ ok: true, user: { name, email, role } }, { status: 201 });
}
