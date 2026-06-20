/**
 * Snapshot builder — gathers project state + memory + artifacts to push to the Brain.
 *
 * Privacy at source: secrets (tokens, password hashes) are stripped BEFORE the
 * snapshot leaves the machine. The Brain stores experience, never credentials.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactRef, MemoryEntry, SnapshotPushMessage } from "@mop/link-protocol";

const SENSITIVE_KEY = /(token|secret|password|passwordhash|apikey|api_key)/i;

/** Recursively strip values whose key looks sensitive. */
export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = redactSensitive(v);
    }
    return out as unknown as T;
  }
  return value;
}

async function readState(projectRoot: string): Promise<unknown> {
  const p = join(projectRoot, ".MOP", "STATE.json");
  if (!existsSync(p)) return {};
  return JSON.parse(await readFile(p, "utf8"));
}

/** Read recent episodic entries from monthly JSONL files (.MOP/memory/YYYY-MM.jsonl). */
async function readMemory(projectRoot: string, limit = 200): Promise<MemoryEntry[]> {
  const dir = join(projectRoot, ".MOP", "memory");
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse();

  const entries: MemoryEntry[] = [];
  for (const f of files) {
    const raw = await readFile(join(dir, f), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as MemoryEntry);
      } catch {
        /* skip malformed line */
      }
    }
    if (entries.length >= limit) break;
  }
  return entries.slice(0, limit);
}

async function listArtifacts(projectRoot: string): Promise<ArtifactRef[]> {
  const dir = join(projectRoot, ".MOP", "artifacts");
  if (!existsSync(dir)) return [];
  const out: ArtifactRef[] = [];
  const walk = async (d: string, base: string): Promise<void> => {
    for (const name of await readdir(d)) {
      const full = join(d, name);
      const s = await stat(full);
      if (s.isDirectory()) await walk(full, join(base, name));
      else out.push({ path: join(base, name), updatedAt: s.mtimeMs });
    }
  };
  await walk(dir, "");
  return out;
}

export async function buildSnapshot(
  projectRoot: string,
  projectId: string,
): Promise<SnapshotPushMessage> {
  const [state, memory, artifacts] = await Promise.all([
    readState(projectRoot),
    readMemory(projectRoot),
    listArtifacts(projectRoot),
  ]);
  return {
    t: "snapshot.push",
    projectId,
    state: redactSensitive(state),
    memory,
    artifacts,
  };
}
