/**
 * Smoke test: Fasa 3.5 + 5 — scheduled consolidation job, skills registry +
 * procedural recall, and the graph shape.
 *   npx tsx scripts/smoke-fasa5.mts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-f5-"));
process.env.MOP_AGENT_CONSOLIDATE_CRON = "0 3 * * *"; // enable scheduler

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { ingestSnapshot } = await import("../apps/web/lib/brain/mirror.js");
const { registerProject } = await import("../apps/web/lib/link/store.js");
const { addSkill, listSkills } = await import("../apps/web/lib/brain/skills.js");
const { recall } = await import("../apps/web/lib/brain/broker.js");
const { startScheduler } = await import("../apps/web/lib/brain/scheduler.js");
const { listSemanticNotes } = await import("../apps/web/lib/brain/consolidate.js");
const { DEFAULT_CAPABILITIES } = await import("../packages/link-protocol/src/index.js");

async function main() {
  await runAllMigrations();
  registerProject({ projectId: "proj-a", name: "A", mopFlowVersion: "1.3.0-dev", platform: "linux", capabilities: DEFAULT_CAPABILITIES });

  // scheduler registers the cron job (doesn't fire now; we just verify it starts)
  const jobs = startScheduler();
  console.log(`[test] scheduler jobs: ${jobs.join(", ")}`);

  // skills registry + procedural recall
  await addSkill({ name: "Retry with backoff", description: "Use exponential backoff when a network call fails", body: "sleep = base * 2^attempt, cap at 30s" });
  console.log(`[test] skills count: ${listSkills().length}`);

  await ingestSnapshot({
    t: "snapshot.push", projectId: "proj-a", state: {}, artifacts: [],
    memory: [{ id: "m1", kind: "decision", summary: "network calls should retry on failure", at: Date.now() }],
  });

  const pack = await recall({ query: "how to handle a failing network call with backoff?", projectId: "proj-a" });
  console.log(`[test] recall procedural=${pack.procedural.length} episodic=${pack.episodic.length}`);
  if (pack.procedural[0]) console.log(`   skill: ${pack.procedural[0].name}`);
  console.log(`[test] prompt includes skills section: ${/Reusable skills/.test(pack.toPromptString())}`);

  const ok =
    jobs.some((j) => j.startsWith("consolidate@")) &&
    listSkills().length === 1 &&
    pack.procedural.length >= 1 &&
    /Reusable skills/.test(pack.toPromptString());

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
