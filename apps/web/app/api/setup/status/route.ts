/** GET /api/setup/status — first-run state plus a non-error session check. */
import { auth, ownerExists } from "@/lib/auth";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  return Response.json(
    { ownerExists: ownerExists(), authenticated: !!session },
    {
      headers: {
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
        "Vary": "Cookie",
      },
    },
  );
}
