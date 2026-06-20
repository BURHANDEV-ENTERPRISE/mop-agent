/**
 * Shared SQLite connection: one better-sqlite3 instance used by BOTH Drizzle
 * (app tables) and Better Auth (its Kysely adapter). better-sqlite3 is synchronous,
 * so a single shared connection is correct and simplest.
 *
 * sqlite-vec is loaded onto the connection so vector queries work everywhere.
 */
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dataDir, dbPath } from "./paths";
import * as schema from "./schema";

let _sqlite: Database.Database | null = null;

export function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite;
  mkdirSync(dataDir(), { recursive: true });
  const db = new Database(dbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  _sqlite = db;
  return db;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  _db = drizzle(getSqlite(), { schema });
  return _db;
}
