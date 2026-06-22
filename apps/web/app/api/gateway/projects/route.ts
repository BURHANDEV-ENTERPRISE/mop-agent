/**
 * POST /api/gateway/projects — request a new project slot + pairing key from
 * the gateway. Owner-only (requires a valid Better Auth session).
 *
 * Proxies to POST <gateway>/api/agent/projects using the agent's device token.
 * Returns { pairingKey, projectLinkId, ttl } — the Brain UI shows the key to
 * the user so they can paste it into `mop-flow link --key <pairingKey>`.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { ensureDeviceToken, gatewayUrl } from "@/lib/gateway/device";

export async function POST(req: Request): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;

  // Zero-setup: self-enroll transparently on first use (no dashboard, no token paste).
  let deviceToken: string;
  try {
    deviceToken = await ensureDeviceToken();
  } catch (e) {
    return NextResponse.json(
      { error: "enroll_failed", hint: "Could not reach the gateway to register this agent.", detail: String(e) },
      { status: 502 },
    );
  }

  const base = gatewayUrl();
  const res = await fetch(`${base}/api/agent/projects`, {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
  }).catch((e: Error) => {
    throw new Error(`gateway_unreachable: ${e.message}`);
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: "gateway_error", detail: data },
      { status: res.status },
    );
  }

  // data: { pairingKey, projectLinkId, ttl }
  return NextResponse.json(data);
}
