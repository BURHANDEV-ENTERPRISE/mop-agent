/** GET /api/members — list users + roles (owner). */
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
