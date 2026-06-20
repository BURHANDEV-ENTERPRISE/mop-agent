/**
 * .MOP/link.json read/write — the per-project link credential + config.
 * The bearer token lives ONLY here (gitignored, chmod 600 on POSIX).
 */
import { readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Capabilities } from "@mop/link-protocol";

export type LinkFile = {
  schemaVersion: "1.0";
  agentUrl: string;
  wsUrl: string;
  projectId: string;
  linkToken: string;
  capabilities: Capabilities;
  lastSyncAt: string | null;
  autoSync: boolean;
};

export function linkPath(projectRoot: string): string {
  return join(projectRoot, ".MOP", "link.json");
}

export function isLinked(projectRoot: string): boolean {
  return existsSync(linkPath(projectRoot));
}

export async function readLink(projectRoot: string): Promise<LinkFile> {
  const raw = await readFile(linkPath(projectRoot), "utf8");
  return JSON.parse(raw) as LinkFile;
}

export async function writeLink(projectRoot: string, link: LinkFile): Promise<void> {
  const p = linkPath(projectRoot);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(link, null, 2), "utf8");
  // Best-effort restrictive perms on POSIX; on Windows this is a no-op.
  try {
    await chmod(p, 0o600);
  } catch {
    /* Windows / unsupported FS — file is gitignored regardless */
  }
}
