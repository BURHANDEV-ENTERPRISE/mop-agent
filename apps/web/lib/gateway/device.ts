/**
 * Device token storage — agent identity to the gateway.
 *
 * Written once during enrollment (gateway dashboard → "Enroll agent") and
 * read on every outbound call. Stored in the OS data dir, chmod 600, so
 * it lives outside any project repo and survives app reinstalls.
 *
 * Fall-through order:
 *   1. gateway-device.json (OS data dir)
 *   2. GATEWAY_DEVICE_TOKEN env var (CI / Docker)
 *   3. null → caller must surface an "agent not registered" error
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../db/paths";

export const DEFAULT_GATEWAY_URL = "https://mop-gateway.burhan.my";

type DeviceFile = { deviceToken: string; gatewayUrl: string };

function devicePath(): string {
  return join(dataDir(), "gateway-device.json");
}

function readDeviceFile(): DeviceFile | null {
  const p = devicePath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as DeviceFile;
  } catch {
    return null;
  }
}

/** Returns the device token string or null if not enrolled. */
export function getDeviceToken(): string | null {
  const f = readDeviceFile();
  if (f?.deviceToken) return f.deviceToken;
  return process.env.GATEWAY_DEVICE_TOKEN ?? null;
}

/**
 * Returns the configured gateway URL:
 *   file → GATEWAY_URL env → default (https://mop-gateway.burhan.my)
 */
export function gatewayUrl(): string {
  const fromFile = readDeviceFile()?.gatewayUrl;
  return (fromFile ?? process.env.GATEWAY_URL ?? DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
}

/** Persist token + URL after enrollment. */
export function saveDeviceToken(deviceToken: string, url: string = DEFAULT_GATEWAY_URL): void {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const p = devicePath();
  writeFileSync(p, JSON.stringify({ deviceToken, gatewayUrl: url }, null, 2), "utf8");
  try { chmodSync(p, 0o600); } catch { /* Windows: rely on profile ACL */ }
}
