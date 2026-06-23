/**
 * Provider config store. Two layers:
 *  - providerSlot (NEW): shared/global chain — one `main` + ordered `fallback`s,
 *    used by every user. Keys AES-GCM encrypted at rest.
 *  - providerConfig (LEGACY): the old per-owner single provider; kept so older
 *    callers don't break. New code uses the slot API.
 */
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { providerConfig, providerSlot } from "../db/schema";
import { decryptSecret, encryptSecret, keyHint } from "../crypto";
import { getProviderMeta } from "./catalog";
import type { OAuthProviderId, OAuthTokens, SlotRole as OAuthSlotRole } from "./oauth";

export type SlotRole = "main" | "fallback";
export type SlotRow = typeof providerSlot.$inferSelect;

export type SlotInput = {
  provider: string;
  role?: SlotRole;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  label?: string;
};

export type MaskedSlot = {
  id: string;
  provider: string;
  name: string;
  role: SlotRole;
  orderIndex: number;
  authType: string;
  model: string | null;
  baseUrl: string | null;
  keyHint: string | null;
  enabled: boolean;
  connected: boolean;
};

function newId(): string {
  return `ps_${randomBytes(6).toString("hex")}`;
}

// ── reads ────────────────────────────────────────────────────────────────────

export function listSlots(): SlotRow[] {
  return getDb().select().from(providerSlot).orderBy(asc(providerSlot.orderIndex)).all();
}

export function getMainSlot(): SlotRow | undefined {
  return getDb().select().from(providerSlot).where(eq(providerSlot.role, "main")).all()[0];
}

export function getFallbackSlots(): SlotRow[] {
  return getDb()
    .select()
    .from(providerSlot)
    .where(eq(providerSlot.role, "fallback"))
    .orderBy(asc(providerSlot.orderIndex))
    .all();
}

function getSlot(id: string): SlotRow | undefined {
  return getDb().select().from(providerSlot).where(eq(providerSlot.id, id)).all()[0];
}

/** OAuth slots store their token bundle (JSON) in apiKeyEnc instead of an API key. */
export function readOAuthTokens(row: SlotRow): OAuthTokens | null {
  if (row.authType !== "oauth" || !row.apiKeyEnc) return null;
  try {
    const parsed = JSON.parse(decryptSecret(row.apiKeyEnc)) as Partial<OAuthTokens>;
    if (!parsed.access_token) return null;
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: Number(parsed.expires_at ?? 0),
    };
  } catch {
    return null;
  }
}

export function maskSlot(row: SlotRow): MaskedSlot {
  const meta = getProviderMeta(row.provider);
  let hint: string | null = null;
  let connected = false;

  if (row.authType === "oauth") {
    const tokens = readOAuthTokens(row);
    connected = !!tokens;
    hint = tokens ? (tokens.expires_at > Date.now() ? "subscription · linked" : "subscription · expired") : null;
  } else if (row.apiKeyEnc) {
    connected = true;
    try {
      hint = keyHint(decryptSecret(row.apiKeyEnc));
    } catch {
      hint = "••••";
    }
  }

  return {
    id: row.id,
    provider: row.provider,
    name: meta?.name ?? row.label ?? row.provider,
    role: row.role as SlotRole,
    orderIndex: row.orderIndex,
    authType: row.authType,
    model: row.model,
    baseUrl: row.baseUrl,
    keyHint: hint,
    enabled: row.enabled,
    connected,
  };
}

export function listMaskedSlots(): { main: MaskedSlot | null; fallbacks: MaskedSlot[] } {
  const main = getMainSlot();
  return {
    main: main ? maskSlot(main) : null,
    fallbacks: getFallbackSlots().map(maskSlot),
  };
}

// ── writes ───────────────────────────────────────────────────────────────────

function resolveFields(input: SlotInput, existing?: SlotRow) {
  const meta = getProviderMeta(input.provider);
  return {
    provider: input.provider,
    label: input.label ?? existing?.label ?? null,
    authType: meta?.auth ?? "apikey",
    apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : (existing?.apiKeyEnc ?? null),
    baseUrl: input.baseUrl ?? existing?.baseUrl ?? meta?.baseUrl ?? null,
    model: input.model ?? existing?.model ?? meta?.defaultModel ?? null,
  };
}

/** Upsert the single `main` slot (provider + credentials). */
export function setMainSlot(input: SlotInput): MaskedSlot {
  const existing = getMainSlot();
  const fields = resolveFields(input, existing);
  if (existing) {
    getDb()
      .update(providerSlot)
      .set({ ...fields, updatedAt: Date.now() })
      .where(eq(providerSlot.id, existing.id))
      .run();
    return maskSlot(getSlot(existing.id)!);
  }
  const id = newId();
  getDb()
    .insert(providerSlot)
    .values({ id, ...fields, role: "main", orderIndex: 0, enabled: true, updatedAt: Date.now() })
    .run();
  return maskSlot(getSlot(id)!);
}

/** Append a new fallback slot at the end of the chain. */
export function addFallbackSlot(input: SlotInput): MaskedSlot {
  const fields = resolveFields(input);
  const maxOrder = getFallbackSlots().reduce((max, slot) => Math.max(max, slot.orderIndex), -1);
  const id = newId();
  getDb()
    .insert(providerSlot)
    .values({ id, ...fields, role: "fallback", orderIndex: maxOrder + 1, enabled: true, updatedAt: Date.now() })
    .run();
  return maskSlot(getSlot(id)!);
}

/**
 * Persist OAuth tokens into a slot (main upsert or fallback append). Tokens are
 * AES-GCM encrypted at rest in apiKeyEnc, same column as API keys.
 */
export function saveOAuthSlot(provider: OAuthProviderId, role: OAuthSlotRole, tokens: OAuthTokens): MaskedSlot {
  const meta = getProviderMeta(provider);
  const apiKeyEnc = encryptSecret(JSON.stringify(tokens));
  const fields = {
    provider,
    label: meta?.name ?? null,
    authType: "oauth" as const,
    apiKeyEnc,
    baseUrl: null,
    model: meta?.defaultModel ?? null,
  };

  if (role === "main") {
    const existing = getMainSlot();
    if (existing) {
      getDb().update(providerSlot).set({ ...fields, updatedAt: Date.now() }).where(eq(providerSlot.id, existing.id)).run();
      return maskSlot(getSlot(existing.id)!);
    }
    const id = newId();
    getDb().insert(providerSlot).values({ id, ...fields, role: "main", orderIndex: 0, enabled: true, updatedAt: Date.now() }).run();
    return maskSlot(getSlot(id)!);
  }

  // fallback: reuse an existing oauth slot for the same provider, else append
  const existing = getFallbackSlots().find((s) => s.provider === provider && s.authType === "oauth");
  if (existing) {
    getDb().update(providerSlot).set({ ...fields, updatedAt: Date.now() }).where(eq(providerSlot.id, existing.id)).run();
    return maskSlot(getSlot(existing.id)!);
  }
  const maxOrder = getFallbackSlots().reduce((max, slot) => Math.max(max, slot.orderIndex), -1);
  const id = newId();
  getDb().insert(providerSlot).values({ id, ...fields, role: "fallback", orderIndex: maxOrder + 1, enabled: true, updatedAt: Date.now() }).run();
  return maskSlot(getSlot(id)!);
}

/** Overwrite just the token bundle on an existing oauth slot (used after refresh). */
export function writeOAuthTokens(id: string, tokens: OAuthTokens): void {
  getDb()
    .update(providerSlot)
    .set({ apiKeyEnc: encryptSecret(JSON.stringify(tokens)), updatedAt: Date.now() })
    .where(eq(providerSlot.id, id))
    .run();
}

export function updateSlot(
  id: string,
  patch: { model?: string; baseUrl?: string; apiKey?: string; enabled?: boolean },
): MaskedSlot | null {
  const existing = getSlot(id);
  if (!existing) return null;
  const set: Partial<SlotRow> = { updatedAt: Date.now() };
  if (patch.model !== undefined) set.model = patch.model;
  if (patch.baseUrl !== undefined) set.baseUrl = patch.baseUrl;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.apiKey) set.apiKeyEnc = encryptSecret(patch.apiKey);
  getDb().update(providerSlot).set(set).where(eq(providerSlot.id, id)).run();
  return maskSlot(getSlot(id)!);
}

export function removeSlot(id: string): void {
  getDb().delete(providerSlot).where(eq(providerSlot.id, id)).run();
}

/** Reorder fallback slots to match the given id order (drag-and-drop). */
export function reorderFallbacks(orderedIds: string[]): void {
  const db = getDb();
  orderedIds.forEach((id, index) => {
    db.update(providerSlot)
      .set({ orderIndex: index, updatedAt: Date.now() })
      .where(and(eq(providerSlot.id, id), eq(providerSlot.role, "fallback")))
      .run();
  });
}

// ── legacy (old per-owner provider_config) ───────────────────────────────────

export type ProviderId = string;

export function getProviderConfigRow(ownerId?: string) {
  const db = getDb();
  if (ownerId) {
    const [row] = db.select().from(providerConfig).where(eq(providerConfig.ownerId, ownerId)).all();
    if (row) return row;
  }
  return db.select().from(providerConfig).all()[0];
}

export function getDecryptedKey(row: { apiKeyEnc: string }): string {
  return decryptSecret(row.apiKeyEnc);
}
