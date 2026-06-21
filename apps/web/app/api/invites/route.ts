/**
 * GET  /api/invites — list invites (owner).
 * POST /api/invites — invite an email { email, role? } (owner). Email-scoped.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { invite } from "@/lib/db/schema";
import { requireRole } from "@/lib/authz";

export async function GET(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  return Response.json({ invites: getDb().select().from(invite).all() });
}

export async function POST(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as { email?: string; role?: "member" | "owner"; ttlDays?: number };
  if (!body?.email) return Response.json({ error: "missing_email" }, { status: 400 });
  const role = body.role === "owner" ? "owner" : "member";
  const expiresAt = Date.now() + (body.ttlDays ?? 7) * 86_400_000;
  getDb()
    .insert(invite)
    .values({ email: body.email, role, expiresAt, usedAt: null, invitedBy: a.userId, createdAt: Date.now() })
    .onConflictDoUpdate({ target: invite.email, set: { role, expiresAt, usedAt: null, invitedBy: a.userId } })
    .run();
  return Response.json({ ok: true, email: body.email, role, expiresAt });
}

export async function DELETE(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const email = new URL(req.url).searchParams.get("email");
  if (!email) return Response.json({ error: "missing_email" }, { status: 400 });
  getDb().delete(invite).where(eq(invite.email, email)).run();
  return Response.json({ ok: true });
}
