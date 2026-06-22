/**
 * Supabase Realtime subscriber for mop-agent.
 *
 * Connects outbound to the gateway's Supabase Realtime cluster (no inbound
 * port required). Replaces the old reverse-WSS approach (lib/ws/gateway.ts)
 * for projects linked via the mop-gateway flow.
 *
 * Protocol: Phoenix WebSocket over Supabase Realtime v1.
 *   Connect → join realtime:<projectLinkId> with scoped JWT →
 *   receive broadcast messages → ingest snapshots into Brain.
 *
 * JWT refresh: re-calls linkAgent ~60s before expiry and sends a new
 * access_token update to stay subscribed without a reconnect.
 *
 * Env:
 *   MOP_GATEWAY_SUPABASE_URL       https://<ref>.supabase.co  (gateway's project)
 *   MOP_GATEWAY_SUPABASE_ANON_KEY  public anon key (safe to share)
 */
import WebSocket from "ws";
import { getGatewayLink, isExpired, type GatewayLink } from "./store";
import { linkAgent } from "./link";
import { ingestSnapshot } from "@/lib/brain/mirror";

const HEARTBEAT_MS = 25_000;
const REFRESH_SKEW_SEC = 60; // refresh JWT this many seconds before expiry

type PhxMsg = {
  event: string;
  topic: string;
  payload: Record<string, unknown>;
  ref: string | null;
  join_ref: string | null;
};

function realtimeWsUrl(): string {
  const base = (process.env.MOP_GATEWAY_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.MOP_GATEWAY_SUPABASE_ANON_KEY ?? "";
  if (!base || !key) throw new Error("Set MOP_GATEWAY_SUPABASE_URL + MOP_GATEWAY_SUPABASE_ANON_KEY");
  return `${base.replace(/^https?/, "wss")}/realtime/v1/websocket?vsn=1.0.0&apikey=${key}`;
}

function send(ws: WebSocket, msg: PhxMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/**
 * Subscribe to a single project channel. Returns a cancel function.
 *
 * @param projectLinkId  e.g. "plk_abc123"
 */
export function subscribeProject(projectLinkId: string): () => void {
  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let ref = 0;
  let cancelled = false;

  const topic = `realtime:${projectLinkId}`;

  async function resolveLink(): Promise<GatewayLink> {
    const stored = getGatewayLink(projectLinkId);
    if (stored && !isExpired(stored, REFRESH_SKEW_SEC)) return stored;
    return linkAgent(projectLinkId);
  }

  function scheduleRefresh(link: GatewayLink, ws: WebSocket) {
    if (refreshTimer) clearTimeout(refreshTimer);
    const remainingMs = link.obtainedAt + (link.expiresIn - REFRESH_SKEW_SEC) * 1000 - Date.now();
    refreshTimer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const fresh = await linkAgent(projectLinkId);
        // Send access_token update without re-joining.
        send(ws, {
          event: "access_token",
          topic,
          payload: { access_token: fresh.realtimeToken },
          ref: String(++ref),
          join_ref: null,
        });
        scheduleRefresh(fresh, ws);
      } catch {
        // On error just let the next reconnect re-auth.
      }
    }, Math.max(remainingMs, 5_000));
  }

  async function connect() {
    if (cancelled) return;

    let link: GatewayLink;
    try {
      link = await resolveLink();
    } catch (e) {
      console.error(`[gateway/client] ${projectLinkId}: cannot resolve link —`, e);
      setTimeout(connect, 10_000);
      return;
    }

    let backoff = 2_000;

    const open = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(realtimeWsUrl());
      } catch (e) {
        console.error(`[gateway/client] ws init error:`, e);
        setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 30_000);
        return;
      }

      ws.on("open", () => {
        backoff = 2_000;

        // Heartbeat.
        heartbeatTimer = setInterval(() => {
          send(ws!, { event: "heartbeat", topic: "phoenix", payload: {}, ref: String(++ref), join_ref: null });
        }, HEARTBEAT_MS);

        // Join channel.
        send(ws!, {
          event: "phx_join",
          topic,
          payload: {
            config: { broadcast: { self: false }, presence: { key: "" } },
            access_token: link.realtimeToken,
          },
          ref: String(++ref),
          join_ref: String(ref),
        });

        scheduleRefresh(link, ws!);
        console.log(`[gateway/client] ${projectLinkId}: joined ${topic}`);
      });

      ws.on("message", async (raw) => {
        let msg: PhxMsg;
        try { msg = JSON.parse(raw.toString()) as PhxMsg; } catch { return; }

        if (msg.event === "broadcast" && msg.topic === topic) {
          const inner = msg.payload as { event?: string; payload?: unknown };
          if (inner.event === "snapshot.push") {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await ingestSnapshot(inner.payload as any);
            } catch (e) {
              console.error(`[gateway/client] ${projectLinkId}: ingest error`, e);
            }
          }
        }
      });

      ws.on("close", () => {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        if (!cancelled) {
          console.warn(`[gateway/client] ${projectLinkId}: disconnected, retry in ${backoff}ms`);
          setTimeout(open, backoff);
          backoff = Math.min(backoff * 2, 30_000);
        }
      });

      ws.on("error", (e) => {
        console.error(`[gateway/client] ${projectLinkId}: ws error`, e);
        ws?.close();
      });
    };

    open();
  }

  connect();

  return () => {
    cancelled = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (refreshTimer) clearTimeout(refreshTimer);
    ws?.close();
  };
}

/**
 * Subscribe to all stored project links (called once at server startup).
 * Returns a cleanup function that cancels all subscriptions.
 */
export function subscribeAll(): () => void {
  const { listGatewayLinks } = require("./store") as typeof import("./store");
  const cancellers = listGatewayLinks().map((l) => subscribeProject(l.projectLinkId));
  return () => cancellers.forEach((c) => c());
}
