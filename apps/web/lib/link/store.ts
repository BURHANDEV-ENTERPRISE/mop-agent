/**
 * Link registry — DB-backed (Drizzle + SQLite). Same surface the gateway/routes
 * already use. The link token is hashed (sha256) at rest; the plaintext is shown
 * to FLOW exactly once at pairing.
 */
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Capabilities, ProjectManifest } from "@mop/link-protocol";
import { getDb } from "../db/client";
import { project, pairingCode } from "../db/schema";

export type ProjectRecord = {
  id: string;
  name: string;
  mopFlowVersion: string | null;
  capabilities: Capabilities;
  status: "online" | "offline";
  lastSeenAt: number | null;
};

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function createPairingCode(ttlMs = 10 * 60_000): { code: string; expiresAt: number } {
  const code = `${rand4()}-${rand4()}`;
  const expiresAt = Date.now() + ttlMs;
  getDb().insert(pairingCode).values({ code, expiresAt, usedAt: null, createdAt: Date.now() }).run();
  return { code, expiresAt };
}

export function consumePairingCode(code: string): boolean {
  const db = getDb();
  const [row] = db.select().from(pairingCode).where(eq(pairingCode.code, code)).all();
  if (!row || row.usedAt || row.expiresAt < Date.now()) return false;
  db.update(pairingCode).set({ usedAt: Date.now() }).where(eq(pairingCode.code, code)).run();
  return true;
}

export function registerProject(manifest: ProjectManifest): { linkToken: string } {
  const linkToken = randomBytes(32).toString("hex");
  const linkTokenHash = sha256(linkToken);
  getDb()
    .insert(project)
    .values({
      id: manifest.projectId,
      name: manifest.name,
      mopFlowVersion: manifest.mopFlowVersion,
      linkTokenHash,
      capabilities: manifest.capabilities,
      status: "offline",
      lastSeenAt: null,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: project.id,
      set: { name: manifest.name, mopFlowVersion: manifest.mopFlowVersion, linkTokenHash, capabilities: manifest.capabilities },
    })
    .run();
  return { linkToken };
}

export function findProjectByToken(token: string): ProjectRecord | undefined {
  const [row] = getDb().select().from(project).where(eq(project.linkTokenHash, sha256(token))).all();
  return row ? toRecord(row) : undefined;
}

export function setProjectStatus(id: string, status: ProjectRecord["status"]): void {
  getDb().update(project).set({ status, lastSeenAt: Date.now() }).where(eq(project.id, id)).run();
}

export function listProjects(): ProjectRecord[] {
  return getDb().select().from(project).all().map(toRecord);
}

function toRecord(row: typeof project.$inferSelect): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    mopFlowVersion: row.mopFlowVersion,
    capabilities: row.capabilities,
    status: row.status as "online" | "offline",
    lastSeenAt: row.lastSeenAt,
  };
}

function rand4(): string {
  return randomBytes(2).toString("hex").toUpperCase();
}
