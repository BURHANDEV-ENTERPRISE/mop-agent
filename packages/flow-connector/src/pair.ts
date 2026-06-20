/**
 * Pairing — FLOW -> AGENT (HTTP), before the WSS link opens.
 * Posts the project manifest + one-time pairing code, receives a link token.
 */
import { platform } from "node:os";
import {
  DEFAULT_CAPABILITIES,
  type Capabilities,
  type PairRequest,
  type PairResponse,
  type ProjectManifest,
} from "@mop/link-protocol";
import { writeLink, type LinkFile } from "./linkfile.js";

export type PairOptions = {
  projectRoot: string;
  agentUrl: string;
  code: string;
  projectId: string;
  name?: string;
  mopFlowVersion?: string;
  capabilities?: Capabilities;
};

function deriveWsUrl(agentUrl: string): string {
  const u = new URL(agentUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/link";
  return u.toString();
}

export async function pair(opts: PairOptions): Promise<LinkFile> {
  const manifest: ProjectManifest = {
    projectId: opts.projectId,
    name: opts.name ?? opts.projectId,
    mopFlowVersion: opts.mopFlowVersion ?? "1.3.0-dev",
    platform: platform(),
    capabilities: opts.capabilities ?? DEFAULT_CAPABILITIES,
  };

  const body: PairRequest = { code: opts.code, manifest };
  const res = await fetch(new URL("/api/link/pair", opts.agentUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`pair_failed:${res.status}:${text}`);
  }

  const out = (await res.json()) as PairResponse;
  const link: LinkFile = {
    schemaVersion: "1.0",
    agentUrl: opts.agentUrl,
    wsUrl: out.wsUrl ?? deriveWsUrl(opts.agentUrl),
    projectId: out.projectId,
    linkToken: out.linkToken,
    capabilities: manifest.capabilities,
    lastSyncAt: null,
    autoSync: true,
  };
  await writeLink(opts.projectRoot, link);
  return link;
}
