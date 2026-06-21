/**
 * Smoke test: encrypted provider config + resolveProvider picks it up.
 *   npx tsx scripts/smoke-providers.mts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-prov-"));
process.env.MOP_AGENT_SECRET = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.MOP_AGENT_PROVIDER;

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { setProviderConfig, getProviderConfigRow, getDecryptedKey, getProviderConfigMasked } = await import("../apps/web/lib/providers/config.js");
const { resolveProvider } = await import("../apps/web/lib/providers/index.js");

async function main() {
  await runAllMigrations();

  // before: no config -> echo
  console.log(`[test] provider before config: ${resolveProvider("owner1").id}`);

  const KEY = "sk-or-test-1234567890";
  setProviderConfig("owner1", { provider: "openrouter", apiKey: KEY, model: "anthropic/claude-sonnet-4.6" });

  const row = getProviderConfigRow("owner1")!;
  const masked = getProviderConfigMasked("owner1");
  const decrypted = getDecryptedKey(row);
  const provider = resolveProvider("owner1");

  console.log(`[test] stored ciphertext != plaintext: ${row.apiKeyEnc !== KEY}`);
  console.log(`[test] decrypt roundtrip: ${decrypted === KEY}`);
  console.log(`[test] masked: provider=${masked.provider} hint=${masked.keyHint} (no full key)`);
  console.log(`[test] resolveProvider picks: ${provider.id} model=${provider.model}`);

  const ok =
    row.apiKeyEnc !== KEY &&
    !row.apiKeyEnc.includes(KEY) &&
    decrypted === KEY &&
    masked.configured && masked.provider === "openrouter" && masked.keyHint !== KEY &&
    provider.id === "openrouter";

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
