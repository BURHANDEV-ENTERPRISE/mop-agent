/**
 * Brain mirror — DB-backed. Ingests snapshots pushed by FLOW so the Brain is
 * browsable even when the project PC is offline, and embeds each memory into
 * sqlite-vec for recall (the "up" side of the learning loop, PRD §2.7).
 */
import { eq, desc } from "drizzle-orm";
import type { SnapshotPushMessage } from "@mop/link-protocol";
import { getDb } from "../db/client";
import { memoryEntry, projectMirror } from "../db/schema";
import { embedAndIndex } from "../memory/embed";

export type MirrorSummary = {
  projectId: string;
  state: unknown;
  artifacts: SnapshotPushMessage["artifacts"];
  memoryCount: number;
  updatedAt: number;
};

export async function ingestSnapshot(snap: SnapshotPushMessage): Promise<void> {
  const db = getDb();

  db.insert(projectMirror)
    .values({
      projectId: snap.projectId,
      stateJson: JSON.stringify(snap.state),
      artifactsJson: JSON.stringify(snap.artifacts),
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: projectMirror.projectId,
      set: {
        stateJson: JSON.stringify(snap.state),
        artifactsJson: JSON.stringify(snap.artifacts),
        updatedAt: Date.now(),
      },
    })
    .run();

  for (const m of snap.memory) {
    db.insert(memoryEntry)
      .values({
        id: m.id,
        projectId: snap.projectId,
        kind: String(m.kind),
        summary: m.summary,
        body: m.body ?? null,
        actor: m.actor ?? null,
        at: m.at,
        private: m.private ?? true,
      })
      .onConflictDoNothing()
      .run();
    await embedAndIndex("episodic", m.id, `${m.summary}\n${m.body ?? ""}`);
  }
}

export function listProjectMemory(projectId: string, limit = 100): Array<typeof memoryEntry.$inferSelect> {
  return getDb()
    .select()
    .from(memoryEntry)
    .where(eq(memoryEntry.projectId, projectId))
    .orderBy(desc(memoryEntry.at))
    .limit(limit)
    .all();
}

export function getMirror(projectId: string): MirrorSummary | undefined {
  const db = getDb();
  const [row] = db.select().from(projectMirror).where(eq(projectMirror.projectId, projectId)).all();
  if (!row) return undefined;
  const mem = db.select().from(memoryEntry).where(eq(memoryEntry.projectId, projectId)).all();
  return {
    projectId,
    state: row.stateJson ? JSON.parse(row.stateJson) : {},
    artifacts: row.artifactsJson ? JSON.parse(row.artifactsJson) : [],
    memoryCount: mem.length,
    updatedAt: row.updatedAt,
  };
}
