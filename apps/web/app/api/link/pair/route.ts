/**
 * POST /api/link/pair  — FLOW exchanges a one-time pairing code for a link token.
 * Body: { code, manifest }  (see @mop/link-protocol PairRequest)
 */
import {
  LINK_WS_PATH,
  type PairRequest,
  type PairResponse,
} from "@mop/link-protocol";
import { consumePairingCode, registerProject } from "@/lib/link/store";

export async function POST(req: Request): Promise<Response> {
  let body: PairRequest;
  try {
    body = (await req.json()) as PairRequest;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  if (!body?.code || !body?.manifest?.projectId) {
    return Response.json({ error: "missing_code_or_manifest" }, { status: 400 });
  }

  if (!consumePairingCode(body.code)) {
    return Response.json({ error: "invalid_or_expired_code" }, { status: 401 });
  }

  const registered = registerProject(body.manifest);
  if (!registered) {
    // projectId already taken — refuse to overwrite an existing link (hijack guard).
    return Response.json({ error: "project_exists" }, { status: 409 });
  }
  const { linkToken } = registered;

  const wsUrl = new URL(req.url);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.pathname = LINK_WS_PATH;
  wsUrl.search = "";

  const out: PairResponse = {
    projectId: body.manifest.projectId,
    linkToken,
    wsUrl: wsUrl.toString(),
  };
  return Response.json(out);
}
