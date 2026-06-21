/**
 * POST /api/link/code — generate a one-time pairing code for "Link Project".
 * Owner-only: requires a valid Better Auth session.
 */
import { requireRole } from "@/lib/authz";
import { createPairingCode } from "@/lib/link/store";

export async function POST(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const { code, expiresAt } = createPairingCode();
  return Response.json({ code, expiresAt });
}
