/**
 * Subscription OAuth (PKCE) for "log in like Claude Code / Codex".
 *
 * These use the publicly-known first-party client parameters of the official
 * CLIs. The flow is standard OAuth 2.0 Authorization Code + PKCE (S256):
 *
 *   1. startOAuth()    → build the provider authorize URL, stash the PKCE
 *                        verifier keyed by `state` (in-memory, 10-min TTL).
 *   2. user authorises in the browser and copies back the code (Anthropic shows
 *      a `code#state` string on its callback page — the classic paste flow).
 *   3. exchangeCode()  → swap code + verifier for access/refresh tokens.
 *   4. refreshTokens() → renew an expired access token.
 *
 * ⚠️ Experimental + ToS-sensitive: these endpoints are undocumented and gate
 * tokens to their first-party clients. Anthropic's `user:inference` scope is
 * what makes subscription inference possible; OpenAI's Codex client redirects to
 * a localhost listener (only completable when the app can receive localhost:1455),
 * so ChatGPT is wired for tokens but flagged accordingly in the UI.
 */
import { createHash, randomBytes } from "node:crypto";

export type OAuthProviderId = "claude-sub" | "chatgpt-sub";
export type SlotRole = "main" | "fallback";

type OAuthProviderConfig = {
  id: OAuthProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  /** "paste" → callback page displays a code to copy back; "localhost" → redirect to a local listener. */
  flow: "paste" | "localhost";
  /** token endpoint body encoding. Anthropic accepts JSON (+state); OpenAI wants form, no state. */
  tokenStyle: "json" | "form";
};

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = {
  "claude-sub": {
    id: "claude-sub",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://console.anthropic.com/v1/oauth/token",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    redirectUri: "https://console.anthropic.com/oauth/code/callback",
    scope: "org:create_api_key user:profile user:inference",
    flow: "paste",
    tokenStyle: "json",
  },
  "chatgpt-sub": {
    id: "chatgpt-sub",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    redirectUri: "http://localhost:1455/auth/callback",
    scope: "openid profile email offline_access",
    flow: "localhost",
    tokenStyle: "form",
  },
};

export function isOAuthProvider(id: string): id is OAuthProviderId {
  return id === "claude-sub" || id === "chatgpt-sub";
}

export type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  /** epoch ms when access_token expires */
  expires_at: number;
};

// ── PKCE ──────────────────────────────────────────────────────────────────────
function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

// ── pending-state store (in-memory, single process, short-lived) ──────────────
type Pending = { provider: OAuthProviderId; role: SlotRole; verifier: string; createdAt: number };
const pending = new Map<string, Pending>();
const PENDING_TTL = 10 * 60 * 1000;

function sweep(): void {
  const now = Date.now();
  for (const [state, entry] of pending) {
    if (now - entry.createdAt > PENDING_TTL) pending.delete(state);
  }
}

// ── flow ──────────────────────────────────────────────────────────────────────
export function startOAuth(provider: OAuthProviderId, role: SlotRole): { authUrl: string; state: string; flow: "paste" | "localhost" } {
  sweep();
  const cfg = OAUTH_PROVIDERS[provider];
  const { verifier, challenge } = generatePkce();
  const state = base64url(randomBytes(16));
  pending.set(state, { provider, role, verifier, createdAt: Date.now() });

  // Build the query manually so spaces in `scope` encode as %20 (not "+").
  // Anthropic's authorize rejects "+"-encoded scopes with "Invalid request format".
  const params: Record<string, string> = {
    code: "true", // Anthropic: render the code on the callback page
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  };
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return { authUrl: `${cfg.authorizeUrl}?${qs}`, state, flow: cfg.flow };
}

/** Pull the auth code out of whatever the user pastes: bare code, "code#state", or a full callback URL. */
function extractCode(raw: string): string {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const fromQuery = url.searchParams.get("code");
      if (fromQuery) return fromQuery;
      // some callbacks put code in the fragment: #code=...&state=...
      const frag = new URLSearchParams(url.hash.replace(/^#/, ""));
      const fromFrag = frag.get("code");
      if (fromFrag) return fromFrag;
    } catch {
      /* fall through */
    }
  }
  // Anthropic paste flow hands back "code#state"
  return value.includes("#") ? value.split("#")[0]!.trim() : value;
}

function toTokens(data: Record<string, unknown>): OAuthTokens {
  const expiresIn = Number(data.expires_in ?? 3600);
  return {
    access_token: String(data.access_token ?? ""),
    refresh_token: data.refresh_token ? String(data.refresh_token) : undefined,
    expires_at: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
  };
}

export async function exchangeCode(
  state: string,
  rawCode: string,
): Promise<{ provider: OAuthProviderId; role: SlotRole; tokens: OAuthTokens }> {
  sweep();
  const entry = pending.get(state);
  if (!entry) throw new Error("state_expired_or_unknown");
  // NOTE: keep `entry` in the store until the exchange actually succeeds, so a
  // failed attempt (bad paste, transient error) can be retried with the same code.

  const cfg = OAUTH_PROVIDERS[entry.provider];
  const code = extractCode(rawCode);

  // Anthropic accepts a JSON body and wants `state`; OpenAI wants form-encoded
  // and rejects `state` ("Unknown parameter: 'state'").
  let headers: Record<string, string>;
  let body: string;
  if (cfg.tokenStyle === "form") {
    headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      code_verifier: entry.verifier,
    }).toString();
  } else {
    headers = { "content-type": "application/json", accept: "application/json" };
    body = JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      code_verifier: entry.verifier,
      state,
    });
  }

  const response = await fetch(cfg.tokenUrl, { method: "POST", headers, body });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`token_exchange_failed_${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const tokens = toTokens(data);
  if (!tokens.access_token) throw new Error("token_exchange_no_access_token");
  pending.delete(state); // consume the one-time state only on success
  return { provider: entry.provider, role: entry.role, tokens };
}

export async function refreshTokens(provider: OAuthProviderId, refreshToken: string): Promise<OAuthTokens> {
  const cfg = OAUTH_PROVIDERS[provider];
  const refreshFields = { grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId };
  const response = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers:
      cfg.tokenStyle === "form"
        ? { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }
        : { "content-type": "application/json", accept: "application/json" },
    body: cfg.tokenStyle === "form" ? new URLSearchParams(refreshFields).toString() : JSON.stringify(refreshFields),
  });
  if (!response.ok) throw new Error(`refresh_failed_${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;
  const tokens = toTokens(data);
  // some providers omit a fresh refresh_token on renewal — keep the old one
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
  return tokens;
}
