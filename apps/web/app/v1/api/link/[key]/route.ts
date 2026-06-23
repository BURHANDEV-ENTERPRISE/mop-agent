/**
 * POST /v1/api/link/:key — FLOW links directly to this public AGENT.
 *
 * The key is the one-time pairing code shown by "Add Project". The body is the
 * project manifest. We consume the code, register the project, and return the
 * bearer link token + the WebSocket URL the connector dials.
 *
 *   npx mop-flow link https://<this-agent>/v1/api/link/<key>
 *
 * No gateway, no accounts on the agent — the agent is reached directly.
 */
import {
  LINK_WS_PATH,
  DEFAULT_CAPABILITIES,
  type ProjectManifest,
  type PairResponse,
} from "@mop/link-protocol";
import { consumePairingCode, registerProject } from "@/lib/link/store";

/** External base the client actually reached us on (respects nginx proxy headers). */
function wsUrlFromRequest(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto === "https" ? "wss" : "ws"}://${host}${LINK_WS_PATH}`;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await ctx.params;
  if (!key) return Response.json({ error: "missing_key" }, { status: 400 });

  let manifest: ProjectManifest;
  try {
    const body = (await req.json()) as { manifest?: ProjectManifest } & Partial<ProjectManifest>;
    manifest = (body.manifest ?? body) as ProjectManifest;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!manifest?.projectId || !manifest?.name) {
    return Response.json({ error: "missing_manifest" }, { status: 400 });
  }
  if (!manifest.capabilities) manifest.capabilities = DEFAULT_CAPABILITIES;

  if (!consumePairingCode(key)) {
    return Response.json({ error: "invalid_or_expired_key" }, { status: 401 });
  }

  const registered = registerProject(manifest);
  if (!registered) {
    // projectId already taken — refuse to overwrite an existing link (hijack guard).
    return Response.json({ error: "project_exists" }, { status: 409 });
  }
  const { linkToken } = registered;

  const out: PairResponse = {
    projectId: manifest.projectId,
    linkToken,
    wsUrl: wsUrlFromRequest(req),
  };
  return Response.json(out);
}
