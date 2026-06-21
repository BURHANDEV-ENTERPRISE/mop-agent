/**
 * Smoke test: real semantic ranking. The dummy keyword-hash embedder ranked the
 * wrong memory for paraphrased queries; MiniLM should rank by MEANING.
 *   npx tsx scripts/smoke-embedder.mts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-emb-"));

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { ingestSnapshot } = await import("../apps/web/lib/brain/mirror.js");
const { recall } = await import("../apps/web/lib/brain/broker.js");

async function main() {
  await runAllMigrations();

  await ingestSnapshot({
    t: "snapshot.push", projectId: "p", state: {}, artifacts: [],
    memory: [
      { id: "auth", kind: "decision", summary: "users must sign in every new session before access", at: Date.now() },
      { id: "retry", kind: "fix", summary: "wait longer between attempts after a dropped connection", at: Date.now() },
      { id: "pay", kind: "decision", summary: "invoices are billed monthly in arrears", at: Date.now() },
    ],
  });

  // Paraphrased query — shares almost NO keywords with the auth memory.
  const pack = await recall({ query: "how does login authentication work?", projectId: "p", k: 3 });
  const top = pack.episodic[0];
  console.log(`[test] top for "login authentication": ${top?.id} — ${top?.summary}`);
  console.log(`[test] order: ${pack.episodic.map((m) => m.id).join(", ")}`);

  const ok = top?.id === "auth"; // semantic match despite no shared keywords
  console.log(`\n[test] ${ok ? "PASS ✅ (semantic ranking)" : "FAIL ❌ (got " + top?.id + ")"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
