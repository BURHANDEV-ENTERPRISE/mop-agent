/**
 * Link registry — DB-backed (Drizzle + SQLite). Same surface the gateway/routes
 * already use. The link token is hashed (sha256) at rest; the plaintext is shown
 * to FLOW exactly once at pairing.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Capabilities, ProjectManifest } from "@mop/link-protocol";
import { getDb } from "../db/client";
import { project, pairingCode, projectMirror, memoryEntry } from "../db/schema";

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
  // Atomic claim: a single conditional UPDATE marks the code used only if it is
  // still unused AND unexpired. Avoids the check-then-act race of SELECT+UPDATE.
  const now = Date.now();
  const res = getDb()
    .update(pairingCode)
    .set({ usedAt: now })
    .where(and(eq(pairingCode.code, code), isNull(pairingCode.usedAt), gt(pairingCode.expiresAt, now)))
    .run();
  return res.changes === 1;
}

/**
 * Register a NEW project for a freshly consumed pairing code.
 *
 * Insert-only: a pairing code may only CREATE a project, never overwrite an
 * existing one. Because `projectId` is client-supplied (and shown in the UI /
 * logs), allowing onConflictDoUpdate would let any valid code clobber another
 * project's link token = hijack. Returns null on conflict; the caller must
 * surface "project_exists" (re-link requires removing the project first).
 */
export function registerProject(manifest: ProjectManifest): { linkToken: string } | null {
  const linkToken = randomBytes(32).toString("hex");
  const linkTokenHash = sha256(linkToken);
  const res = getDb()
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
    .onConflictDoNothing({ target: project.id })
    .run();
  if (res.changes === 0) return null;
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

/** Disconnect a project: drop its link, mirror and mirrored memory. Frees the id for re-linking. */
export function removeProject(id: string): boolean {
  const db = getDb();
  const res = db.delete(project).where(eq(project.id, id)).run();
  db.delete(projectMirror).where(eq(projectMirror.projectId, id)).run();
  db.delete(memoryEntry).where(eq(memoryEntry.projectId, id)).run();
  return res.changes > 0;
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
