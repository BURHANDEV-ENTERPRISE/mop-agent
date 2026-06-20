/**
 * Smoke test: channel message routing (no real bot token needed).
 *   npx tsx scripts/smoke-channels.mts
 * Exercises commands (/projects, /use) + grounded answer via handleIncoming.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-chan-"));

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { ingestSnapshot } = await import("../apps/web/lib/brain/mirror.js");
const { registerProject } = await import("../apps/web/lib/link/store.js");
const { handleIncoming } = await import("../apps/web/lib/channels/handler.js");
const { DEFAULT_CAPABILITIES } = await import("../packages/link-protocol/src/index.js");

const KEY = "telegram:999";

async function main() {
  await runAllMigrations();

  const r0 = await handleIncoming(KEY, "/projects");
  console.log(`[test] /projects (empty): ${r0}`);

  // two projects so resolution requires an explicit /use
  for (const id of ["alpha", "beta"]) {
    registerProject({ projectId: id, name: id, mopFlowVersion: "1.3.0-dev", platform: "linux", capabilities: DEFAULT_CAPABILITIES });
  }
  await ingestSnapshot({
    t: "snapshot.push", projectId: "alpha", state: {}, artifacts: [],
    memory: [{ id: "x1", kind: "decision", summary: "alpha uses reverse WSS link transport", at: Date.now() }],
  });

  const r1 = await handleIncoming(KEY, "/projects");
  const r2 = await handleIncoming(KEY, "what transport does it use?"); // 2 projects, no binding
  const r3 = await handleIncoming(KEY, "/use alpha");
  const r4 = await handleIncoming(KEY, "what transport does it use?"); // bound -> grounded
  const r5 = await handleIncoming(KEY, "/use ghost"); // unknown

  console.log(`[test] /projects: ${r1.replace(/\n/g, " | ")}`);
  console.log(`[test] ask (no binding): ${r2}`);
  console.log(`[test] /use alpha: ${r3}`);
  console.log(`[test] ask (bound): ${r4.replace(/\n/g, " ")}`);
  console.log(`[test] /use ghost: ${r5}`);

  const ok =
    r0.includes("No projects") &&
    r1.includes("alpha") && r1.includes("beta") &&
    /which project/i.test(r2) &&
    r3.includes("bound") &&
    /transport|reverse|wss|memory/i.test(r4) &&
    /unknown/i.test(r5);

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
