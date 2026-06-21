/**
 * Migrations: app tables (raw SQL, idempotent) + sqlite-vec virtual table +
 * Better Auth tables (via better-auth/db/migration). Safe to run repeatedly.
 */
import { getSqlite } from "./client";
import { EMBED_DIM } from "../memory/embed";

const APP_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mop_flow_version TEXT,
  link_token_hash TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pairing_code (
  code TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_mirror (
  project_id TEXT PRIMARY KEY,
  state_json TEXT,
  artifacts_json TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_entry (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT,
  actor TEXT,
  at INTEGER NOT NULL,
  private INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_memory_project ON memory_entry(project_id);

CREATE TABLE IF NOT EXISTS semantic_note (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_projects TEXT,
  confidence INTEGER NOT NULL DEFAULT 50,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_binding (
  channel_key TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_role (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member',
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  invited_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_config (
  owner_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  model TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_config (
  owner_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  config_enc TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, app_id)
);

CREATE TABLE IF NOT EXISTS skill (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  source_projects TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vec_map (
  rowid INTEGER PRIMARY KEY,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vecmap_ref ON vec_map(ref_type, ref_id);
`;

export async function runAllMigrations(): Promise<void> {
  const sqlite = getSqlite();

  // App tables
  sqlite.exec(APP_TABLES_SQL);

  // sqlite-vec virtual table (raw — Drizzle can't model vec0)
  sqlite.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory USING vec0(embedding float[${EMBED_DIM}]);`,
  );

  // Better Auth tables (user, session, account, verification)
  const { getMigrations } = await import("better-auth/db/migration");
  const { auth } = await import("../auth.js");
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}
