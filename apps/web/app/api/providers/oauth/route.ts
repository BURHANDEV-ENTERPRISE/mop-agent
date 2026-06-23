/**
 * Subscription OAuth (PKCE) for claude.ai / ChatGPT logins. Owner-only.
 *   POST  {provider, role}  → start: returns {authUrl, state, flow}.
 *   PUT   {state, code}     → complete: exchange code, store tokens, return slots.
 *   PATCH {id}              → reconnect: refresh an existing oauth slot's tokens.
 * Tokens are encrypted at rest in the provider slot (see config.saveOAuthSlot).
 */
import { requireRole } from "@/lib/authz";
import { getProviderMeta } from "@/lib/providers/catalog";
import { listMaskedSlots, listSlots, readOAuthTokens, saveOAuthSlot, updateSlot, writeOAuthTokens } from "@/lib/providers/config";
import { exchangeCode, isOAuthProvider, refreshTokens, startOAuth } from "@/lib/providers/oauth";

export async function POST(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as { provider?: string; role?: "main" | "fallback" };
  if (!body.provider || !isOAuthProvider(body.provider)) {
    return Response.json({ error: "not_an_oauth_provider" }, { status: 400 });
  }
  const { authUrl, state, flow } = startOAuth(body.provider, body.role === "fallback" ? "fallback" : "main");
  return Response.json({ authUrl, state, flow });
}

export async function PUT(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as { state?: string; code?: string };
  if (!body.state || !body.code) return Response.json({ error: "missing_state_or_code" }, { status: 400 });
  try {
    const { provider, role, tokens } = await exchangeCode(body.state, body.code);
    const slot = saveOAuthSlot(provider, role, tokens);
    return Response.json({ slot, ...listMaskedSlots() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "exchange_failed" }, { status: 400 });
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const body = (await req.json()) as { id?: string };
  if (!body.id) return Response.json({ error: "missing_id" }, { status: 400 });
  const slot = listSlots().find((s) => s.id === body.id);
  if (!slot || slot.authType !== "oauth") return Response.json({ error: "not_an_oauth_slot" }, { status: 400 });
  if (!isOAuthProvider(slot.provider)) return Response.json({ error: "unknown_oauth_provider" }, { status: 400 });
  const tokens = readOAuthTokens(slot);
  if (!tokens?.refresh_token) return Response.json({ error: "no_refresh_token" }, { status: 400 });
  try {
    const fresh = await refreshTokens(slot.provider, tokens.refresh_token);
    writeOAuthTokens(slot.id, fresh);
    // also realign the model to the current catalog default (e.g. after we change
    // it because the provider stopped accepting an old model id)
    const def = getProviderMeta(slot.provider)?.defaultModel;
    if (def) updateSlot(slot.id, { model: def });
    return Response.json(listMaskedSlots());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "refresh_failed" }, { status: 400 });
  }
}
