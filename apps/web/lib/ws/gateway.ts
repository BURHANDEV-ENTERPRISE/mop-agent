/**
 * Reverse WSS gateway — accepts inbound connections FROM FLOW nodes.
 *
 * FLOW dials out (Authorization: Bearer <linkToken>); the AGENT authenticates the
 * token, then uses the persistent socket to push snapshots up and send tool
 * requests down. Lives on the custom Node server (see server.ts).
 */
import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import {
  LINK_PROTOCOL_VERSION,
  LINK_WS_PATH,
  parseLinkMessage,
  type LinkMessage,
  type McpToolName,
} from "@mop/link-protocol";
import { findProjectByToken, setProjectStatus } from "../link/store.js";
import { ingestSnapshot } from "../brain/mirror.js";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

// Shared across the custom server (server.ts via tsx) and Next route bundles —
// without globalThis these would be separate module instances and callFlow()
// from an API route would never see the socket the gateway registered.
const g = globalThis as unknown as {
  __mopLiveLinks?: Map<string, WebSocket>;
  __mopPending?: Map<string, Pending>;
};
const liveLinks = (g.__mopLiveLinks ??= new Map<string, WebSocket>()); // projectId -> socket
const pending = (g.__mopPending ??= new Map<string, Pending>()); // req id -> resolver

export function attachGateway(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: LINK_WS_PATH });

  wss.on("connection", (ws, req) => {
    const token = (req.headers["authorization"] ?? "").toString().replace(/^Bearer\s+/i, "");
    const proj = findProjectByToken(token);
    if (!proj) {
      ws.close(4001, "unauthorized");
      return;
    }

    liveLinks.set(proj.id, ws);
    setProjectStatus(proj.id, "online");
    console.log(`[gateway] ${proj.id} online`);

    ws.send(
      JSON.stringify({
        t: "hello",
        capabilities: proj.capabilities,
        serverTime: Date.now(),
        protocolVersion: LINK_PROTOCOL_VERSION,
      }),
    );

    ws.on("message", async (raw) => {
      let msg: LinkMessage;
      try {
        msg = parseLinkMessage(raw.toString());
      } catch {
        return;
      }
      if (msg.t === "snapshot.push") {
        try {
          await ingestSnapshot(msg);
          console.log(`[gateway] ${proj.id} snapshot: ${msg.memory.length} memories`);
        } catch (e) {
          console.error(`[gateway] ${proj.id} ingest failed:`, e);
        }
      } else if (msg.t === "res") {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error ?? "flow_error"));
        }
      } else if (msg.t === "ping") {
        ws.send(JSON.stringify({ t: "pong" }));
      }
    });

    ws.on("close", () => {
      liveLinks.delete(proj.id);
      setProjectStatus(proj.id, "offline");
      console.log(`[gateway] ${proj.id} offline`);
    });
  });

  return wss;
}

/** AGENT -> FLOW: call a tool over the live link. Rejects if the project is offline. */
export function callFlow(
  projectId: string,
  tool: McpToolName,
  args: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<unknown> {
  const ws = liveLinks.get(projectId);
  if (!ws) return Promise.reject(new Error("project_offline"));
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ t: "req", id, tool, args }));
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error("flow_timeout"));
    }, timeoutMs);
  });
}

export function isOnline(projectId: string): boolean {
  return liveLinks.has(projectId);
}
