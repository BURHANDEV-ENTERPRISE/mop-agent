/** Channel ↔ project binding (which project a chat talks to). */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { channelBinding } from "../db/schema";
import { listProjects } from "../link/store";

export function getBinding(channelKey: string): string | undefined {
  const [row] = getDb().select().from(channelBinding).where(eq(channelBinding.channelKey, channelKey)).all();
  return row?.projectId;
}

export function setBinding(channelKey: string, projectId: string): void {
  getDb()
    .insert(channelBinding)
    .values({ channelKey, projectId, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: channelBinding.channelKey, set: { projectId, updatedAt: Date.now() } })
    .run();
}

/** Resolve the project for a chat: explicit binding, else the only project, else undefined. */
export function resolveProject(channelKey: string): string | undefined {
  const bound = getBinding(channelKey);
  if (bound) return bound;
  const projects = listProjects();
  return projects.length === 1 ? projects[0]!.id : undefined;
}
