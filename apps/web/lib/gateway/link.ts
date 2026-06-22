/**
 * mop-agent → gateway link handshake (v1).
 *
 * Calls POST <gateway>/v1/api/link/agent with the agent's device token to bind
 * onto a project channel and receive a scoped Supabase-Realtime JWT. The creds
 * are persisted (see ./store) for the Realtime subscriber to join the relay.
 *
 * This is the HANDSHAKE only — the live snapshot/tool transport over Supabase
 * Realtime is wired separately. Until then the legacy reverse-WSS link
 * (lib/ws/gateway.ts) keeps working unchanged.
 */
import { saveGatewayLink, type GatewayLink } from "./store";
import { getDeviceToken, gatewayUrl } from "./device";

export { gatewayUrl } from "./device";

type AgentLinkResponse = {
  projectLinkId: string;
  channel: string;
  realtimeToken: string;
  expiresIn: number;
};

/**
 * Bind this agent to a project channel on the gateway and persist the channel JWT.
 * `projectLinkId` is the address the flow side prints when it links (plk_xxx).
 */
export async function linkAgent(
  projectLinkId: string,
  opts: { gateway?: string; deviceToken?: string } = {},
): Promise<GatewayLink> {
  const base = (opts.gateway ?? gatewayUrl()).replace(/\/+$/, "");
  const token = opts.deviceToken ?? getDeviceToken();
  if (!token) {
    throw new Error("missing_device_token: enroll agent first (gateway dashboard → Enroll agent)");
  }

  const res = await fetch(`${base}/v1/api/link/agent`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ projectLinkId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`link_agent_failed:${res.status}:${text}`);
  }

  const out = (await res.json()) as AgentLinkResponse;
  const link: GatewayLink = {
    projectLinkId: out.projectLinkId,
    channel: out.channel,
    realtimeToken: out.realtimeToken,
    expiresIn: out.expiresIn,
    obtainedAt: Date.now(),
  };
  saveGatewayLink(link);
  return link;
}
