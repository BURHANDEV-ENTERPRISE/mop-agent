/**
 * POST /api/link/code — generate a one-time pairing code for "Link Project".
 * Owner-only: requires a valid Better Auth session.
 */
import { auth } from "@/lib/auth";
import { createPairingCode } from "@/lib/link/store";

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { code, expiresAt } = createPairingCode();
  return Response.json({ code, expiresAt });
}
