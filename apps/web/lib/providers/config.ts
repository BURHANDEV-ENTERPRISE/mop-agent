/** Provider config store — encrypted API keys (AES-GCM) per owner. */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { providerConfig } from "../db/schema";
import { decryptSecret, encryptSecret, keyHint } from "../crypto";

export type ProviderId = "anthropic" | "openrouter";

export function setProviderConfig(ownerId: string, input: { provider: ProviderId; apiKey: string; model?: string }): void {
  const apiKeyEnc = encryptSecret(input.apiKey);
  getDb()
    .insert(providerConfig)
    .values({ ownerId, provider: input.provider, apiKeyEnc, model: input.model ?? null, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: providerConfig.ownerId,
      set: { provider: input.provider, apiKeyEnc, model: input.model ?? null, updatedAt: Date.now() },
    })
    .run();
}

/** Raw row (with encrypted key) for a given owner, or the first configured owner. */
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

/** Safe view for the UI — never returns the key itself. */
export function getProviderConfigMasked(ownerId?: string): {
  configured: boolean;
  provider?: ProviderId;
  model?: string | null;
  keyHint?: string;
} {
  const row = getProviderConfigRow(ownerId);
  if (!row) return { configured: false };
  let hint = "••••";
  try {
    hint = keyHint(decryptSecret(row.apiKeyEnc));
  } catch {
    /* secret rotated — can't decrypt */
  }
  return { configured: true, provider: row.provider as ProviderId, model: row.model, keyHint: hint };
}

export function clearProviderConfig(ownerId: string): void {
  getDb().delete(providerConfig).where(eq(providerConfig.ownerId, ownerId)).run();
}
