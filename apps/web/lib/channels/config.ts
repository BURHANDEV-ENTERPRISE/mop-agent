import { decryptSecret, encryptSecret, keyHint } from "../crypto";
import { getSqlite } from "../db/client";

export type AppId = "telegram" | "discord" | "whatsapp" | "slack" | "webhook";
export type AppPayload = { secret: string; fields: Record<string, string> };
type AppRow = { owner_id: string; app_id: AppId; config_enc: string; enabled: number; updated_at: number };

export function listAppConfigs(ownerId: string) {
  const rows = getSqlite().prepare("SELECT * FROM app_config WHERE owner_id = ? ORDER BY app_id").all(ownerId) as AppRow[];
  return rows.map((row) => {
    let hint = "••••";
    try { hint = keyHint((JSON.parse(decryptSecret(row.config_enc)) as AppPayload).secret); } catch { /* masked */ }
    return { appId: row.app_id, configured: true, enabled: !!row.enabled, keyHint: hint, updatedAt: row.updated_at };
  });
}

export function saveAppConfig(ownerId: string, input: { appId: AppId; secret?: string; fields?: Record<string, string>; enabled: boolean }) {
  const existing = getSqlite().prepare("SELECT * FROM app_config WHERE owner_id = ? AND app_id = ?").get(ownerId, input.appId) as AppRow | undefined;
  let previous: AppPayload | undefined;
  if (existing) {
    try { previous = JSON.parse(decryptSecret(existing.config_enc)) as AppPayload; } catch { /* replace invalid config */ }
  }
  const secret = input.secret?.trim() || previous?.secret;
  if (!secret) throw new Error("missing_secret");
  const payload: AppPayload = { secret, fields: { ...(previous?.fields ?? {}), ...(input.fields ?? {}) } };
  getSqlite().prepare(`
    INSERT INTO app_config(owner_id, app_id, config_enc, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, app_id) DO UPDATE SET
      config_enc = excluded.config_enc,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(ownerId, input.appId, encryptSecret(JSON.stringify(payload)), input.enabled ? 1 : 0, Date.now());
}

export function listEnabledAppConfigs(): Array<{ appId: AppId; payload: AppPayload }> {
  const rows = getSqlite().prepare("SELECT * FROM app_config WHERE enabled = 1 ORDER BY updated_at DESC").all() as AppRow[];
  const seen = new Set<AppId>();
  const configs: Array<{ appId: AppId; payload: AppPayload }> = [];
  for (const row of rows) {
    if (seen.has(row.app_id)) continue;
    try {
      configs.push({ appId: row.app_id, payload: JSON.parse(decryptSecret(row.config_enc)) as AppPayload });
      seen.add(row.app_id);
    } catch { /* skip unreadable secrets */ }
  }
  return configs;
}
