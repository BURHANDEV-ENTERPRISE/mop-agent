/**
 * Smoke test: consolidation (episodic → semantic) + recall serves it back.
 *   npx tsx scripts/smoke-consolidate.mts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-consol-"));

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { ingestSnapshot } = await import("../apps/web/lib/brain/mirror.js");
const { consolidate } = await import("../apps/web/lib/brain/consolidate.js");
const { recall } = await import("../apps/web/lib/brain/broker.js");

const mem = (id: string, kind: string, summary: string) => ({ id, kind, summary, at: Date.now() });

async function main() {
  await runAllMigrations();

  // Two projects that both ran into the same theme: websocket reconnect backoff.
  await ingestSnapshot({
    t: "snapshot.push",
    projectId: "proj-a",
    state: {},
    artifacts: [],
    memory: [
      mem("a1", "fix", "websocket reconnect needs exponential backoff to avoid hammering"),
      mem("a2", "decision", "store provider keys encrypted with aes-gcm"),
    ],
  });
  await ingestSnapshot({
    t: "snapshot.push",
    projectId: "proj-b",
    state: {},
    artifacts: [],
    memory: [
      mem("b1", "fix", "added exponential backoff on the reconnect loop after drops"),
      mem("b2", "decision", "owner bootstrap locks signups"),
    ],
  });
  console.log("[test] ingested 4 memories across 2 projects");

  const result = await consolidate();
  console.log(`[test] scanned=${result.scanned} clusters=${result.clusters} notesCreated=${result.notesCreated}`);
  for (const n of result.notes) console.log(`   • ${n.title} (${n.confidence}%, ${n.sourceProjects.length} projects)`);

  // The "backoff/reconnect" pattern should be promoted spanning 2 projects.
  const crossProjectNote = result.notes.find((n) => n.sourceProjects.length >= 2);

  // And recall should now surface the semantic note from the Main Brain.
  const pack = await recall({ query: "what do we know about reconnect backoff?", projectId: "proj-c" });
  console.log(`[test] recall semantic=${pack.semantic.length} episodic=${pack.episodic.length}`);
  if (pack.semantic[0]) console.log(`   semantic top: ${pack.semantic[0].title}`);

  const ok = result.notesCreated > 0 && !!crossProjectNote && pack.semantic.length > 0;
  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
