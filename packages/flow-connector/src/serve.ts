/**
 * Reverse WSS client — FLOW dials OUT to AGENT and keeps the link open.
 *
 * Outbound connection traverses NAT/firewall, so the AGENT can live on a VPS while
 * the project stays on the user's PC. Auto-reconnect with exponential backoff
 * handles laptop sleep / network changes (Windows + Linux).
 */
import WebSocket from "ws";
import {
  parseLinkMessage,
  type Capabilities,
  type LinkMessage,
  type McpToolName,
} from "@mop/link-protocol";
import { readLink, writeLink } from "./linkfile.js";
import { buildSnapshot } from "./snapshot.js";
import { handleToolRequest, type ToolContext } from "./tools.js";

export type ServeOptions = {
  projectRoot: string;
  /** optional hook into the real .MOP session model (v1.2.0) */
  hasValidSession?: ToolContext["hasValidSession"];
  onStatus?: (s: string) => void;
};

const MAX_BACKOFF = 30_000;

export async function serve(opts: ServeOptions): Promise<void> {
  const log = opts.onStatus ?? ((s: string) => console.log(`[mop-flow] ${s}`));
  let backoff = 1_000;
  let stopped = false;

  const connect = async (): Promise<void> => {
    const link = await readLink(opts.projectRoot);
    const ctx: ToolContext = {
      projectRoot: opts.projectRoot,
      capabilities: link.capabilities,
      hasValidSession: opts.hasValidSession,
    };

    const ws = new WebSocket(link.wsUrl, {
      headers: { Authorization: `Bearer ${link.linkToken}` },
    });

    ws.on("open", async () => {
      backoff = 1_000;
      const snap = await buildSnapshot(opts.projectRoot, link.projectId);
      ws.send(JSON.stringify(snap));
      link.lastSyncAt = new Date().toISOString();
      await writeLink(opts.projectRoot, link);
      log(`linked → ${link.wsUrl} · snapshot pushed (${snap.memory.length} memories)`);
    });

    ws.on("message", async (raw) => {
      let msg: LinkMessage;
      try {
        msg = parseLinkMessage(raw.toString());
      } catch {
        return;
      }
      if (msg.t === "req") {
        try {
          const data = await handleToolRequest(msg.tool as McpToolName, msg.args, ctx);
          ws.send(JSON.stringify({ t: "res", id: msg.id, ok: true, data }));
        } catch (e) {
          ws.send(JSON.stringify({ t: "res", id: msg.id, ok: false, error: errMsg(e) }));
        }
      } else if (msg.t === "ping") {
        ws.send(JSON.stringify({ t: "pong" }));
      } else if (msg.t === "hello") {
        log(`hello from AGENT (caps: ${capSummary(msg.capabilities)})`);
      }
    });

    ws.on("close", () => {
      if (stopped) return;
      log(`link closed · retry in ${backoff}ms`);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    });

    ws.on("error", (e) => log(`ws error: ${errMsg(e)}`));
  };

  process.on("SIGINT", () => {
    stopped = true;
    process.exit(0);
  });

  await connect();
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function capSummary(caps: Capabilities): string {
  return Object.entries(caps)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(",");
}
