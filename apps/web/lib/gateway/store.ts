/**
 * Gateway channel-credential store.
 *
 * After the agent calls POST /v1/api/link/agent on the gateway it persists the
 * scoped Supabase-Realtime JWT + channel here, next to the SQLite Brain (under the
 * gitignored data dir). The JWT is short-lived (~1h); the future Realtime
 * subscriber reads this to join the relay and re-mints when it nears expiry.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../db/paths";

export type GatewayLink = {
  projectLinkId: string;
  channel: string; // realtime:<projectLinkId>
  realtimeToken: string; // scoped Supabase Realtime JWT
  expiresIn: number; // seconds
  obtainedAt: number; // epoch ms
};

function gatewayDir(): string {
  return join(dataDir(), "gateway");
}

function storePath(): string {
  return join(gatewayDir(), "links.json");
}

function readAll(): Record<string, GatewayLink> {
  const p = storePath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, GatewayLink>;
  } catch {
    return {};
  }
}

export function saveGatewayLink(link: GatewayLink): void {
  mkdirSync(gatewayDir(), { recursive: true });
  const all = readAll();
  all[link.projectLinkId] = link;
  const p = storePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2), "utf8");
  renameSync(tmp, p); // atomic
}

export function getGatewayLink(projectLinkId: string): GatewayLink | undefined {
  return readAll()[projectLinkId];
}

export function listGatewayLinks(): GatewayLink[] {
  return Object.values(readAll());
}

/** True if the stored JWT is within `skewSec` of expiry (or already past it). */
export function isExpired(link: GatewayLink, skewSec = 60): boolean {
  return Date.now() >= link.obtainedAt + (link.expiresIn - skewSec) * 1000;
}
