/**
 * GET  /api/providers — current provider config (masked) + env-key availability.
 * POST /api/providers — set { provider, apiKey, model } (owner; key encrypted at rest).
 */
import { auth } from "@/lib/auth";
import { getProviderConfigMasked, setProviderConfig, type ProviderId } from "@/lib/providers/config";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({
    config: getProviderConfigMasked(session.user.id),
    env: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY,
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { provider: ProviderId; apiKey: string; model?: string };
  if (!body?.provider || !body?.apiKey) {
    return Response.json({ error: "missing_provider_or_apiKey" }, { status: 400 });
  }
  if (body.provider !== "anthropic" && body.provider !== "openrouter") {
    return Response.json({ error: "unknown_provider" }, { status: 400 });
  }
  setProviderConfig(session.user.id, { provider: body.provider, apiKey: body.apiKey, model: body.model });
  return Response.json({ config: getProviderConfigMasked(session.user.id) });
}
