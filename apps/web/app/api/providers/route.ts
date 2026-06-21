/**
 * GET  /api/providers — current provider config (masked) + env-key availability.
 * POST /api/providers — set { provider, apiKey, model } (owner; key encrypted at rest).
 */
import { requireAuth, requireRole } from "@/lib/authz";
import { getProviderConfigMasked, setProviderConfig, type ProviderId } from "@/lib/providers/config";

export async function GET(req: Request): Promise<Response> {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  return Response.json({
    config: getProviderConfigMasked(a.userId),
    env: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY,
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as { provider: ProviderId; apiKey: string; model?: string };
  if (!body?.provider || !body?.apiKey) {
    return Response.json({ error: "missing_provider_or_apiKey" }, { status: 400 });
  }
  if (body.provider !== "anthropic" && body.provider !== "openrouter") {
    return Response.json({ error: "unknown_provider" }, { status: 400 });
  }
  setProviderConfig(a.userId, { provider: body.provider, apiKey: body.apiKey, model: body.model });
  return Response.json({ config: getProviderConfigMasked(a.userId) });
}
