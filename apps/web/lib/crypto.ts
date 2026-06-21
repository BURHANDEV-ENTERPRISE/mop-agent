/**
 * Secret-at-rest encryption (AES-256-GCM). Key derived from MOP_AGENT_SECRET
 * (64 hex chars = 32 bytes). Used to store provider API keys encrypted.
 * Format: base64(iv).base64(tag).base64(ciphertext)
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.MOP_AGENT_SECRET;
  if (secret && /^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, "hex");
  // Dev fallback: derive a 32-byte key from whatever secret is present (insecure).
  return createHash("sha256").update(secret ?? "mop-agent-dev-insecure-key").digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(encoded: string): string {
  const [ivB, tagB, dataB] = encoded.split(".");
  if (!ivB || !tagB || !dataB) throw new Error("bad ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

/** "sk-…last4" style hint, never the full key. */
export function keyHint(plain: string): string {
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 3)}…${plain.slice(-4)}`;
}
