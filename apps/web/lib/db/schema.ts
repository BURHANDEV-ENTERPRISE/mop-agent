/**
 * Drizzle schema (app tables). Better Auth owns its own tables (user, session,
 * account, verification) — created by Better Auth migrations on the same DB file.
 *
 * The sqlite-vec virtual table `vec_memory` is created via raw SQL in migrate.ts
 * (Drizzle can't model a vec0 virtual table).
 *
 * Timestamps are epoch millis (number) to match @mop/link-protocol.
 */
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { Capabilities } from "@mop/link-protocol";

export const project = sqliteTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mopFlowVersion: text("mop_flow_version"),
  linkTokenHash: text("link_token_hash").notNull(),
  capabilities: text("capabilities", { mode: "json" }).$type<Capabilities>().notNull(),
  status: text("status").notNull().default("offline"),
  lastSeenAt: integer("last_seen_at"),
  createdAt: integer("created_at").notNull(),
});

export const pairingCode = sqliteTable("pairing_code", {
  code: text("code").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const projectMirror = sqliteTable("project_mirror", {
  projectId: text("project_id").primaryKey(),
  stateJson: text("state_json"),
  artifactsJson: text("artifacts_json"),
  updatedAt: integer("updated_at").notNull(),
});

export const memoryEntry = sqliteTable("memory_entry", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  body: text("body"),
  actor: text("actor"),
  at: integer("at").notNull(),
  private: integer("private", { mode: "boolean" }).notNull().default(true),
});

export const semanticNote = sqliteTable("semantic_note", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sourceProjects: text("source_projects", { mode: "json" }).$type<string[]>(),
  confidence: integer("confidence").notNull().default(50), // 0-100
  createdAt: integer("created_at").notNull(),
});

/** Binds a messaging channel/chat to a project (Fasa 4.5). channelKey = "platform:chatId". */
export const channelBinding = sqliteTable("channel_binding", {
  channelKey: text("channel_key").primaryKey(),
  projectId: text("project_id").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Maps a sqlite-vec rowid to the memory/semantic row it embeds. */
export const vecMap = sqliteTable("vec_map", {
  rowid: integer("rowid").primaryKey(),
  refType: text("ref_type").notNull(), // "episodic" | "semantic"
  refId: text("ref_id").notNull(),
});
