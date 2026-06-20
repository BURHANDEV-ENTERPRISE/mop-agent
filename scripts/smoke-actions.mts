/**
 * Smoke test: write-back + approval over the live link.
 *   npx tsx scripts/smoke-actions.mts
 *
 * request append_memory -> approve -> FLOW executes (writes .MOP/memory) -> executed.
 * Also: deny path, and capability-denied path (write_artifact with cap off).
 */
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-act-"));
const PROJ = mkdtempSync(join(tmpdir(), "mop-proj-"));

const { createServer } = await import("node:http");
const { attachGateway } = await import("../apps/web/lib/ws/gateway.js");
const { registerProject } = await import("../apps/web/lib/link/store.js");
const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { requestAction, approveAction, denyAction } = await import("../apps/web/lib/brain/approvals.js");
const { writeLink } = await import("../packages/flow-connector/src/linkfile.js");
const { serve } = await import("../packages/flow-connector/src/serve.js");
const { DEFAULT_CAPABILITIES } = await import("../packages/link-protocol/src/index.js");

const PORT = 3998;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  await runAllMigrations();
  const server = createServer();
  attachGateway(server);
  await new Promise<void>((r) => server.listen(PORT, r));

  // capabilities: writeMemory yes, writeArtifacts NO (to test capability denial)
  const caps = { ...DEFAULT_CAPABILITIES, writeArtifacts: false };
  const { linkToken } = registerProject({
    projectId: "proj-x", name: "Proj X", mopFlowVersion: "1.3.0-dev", platform: "linux", capabilities: caps,
  });
  await writeLink(PROJ, {
    schemaVersion: "1.0", agentUrl: `http://localhost:${PORT}`, wsUrl: `ws://localhost:${PORT}/link`,
    projectId: "proj-x", linkToken, capabilities: caps, lastSyncAt: null, autoSync: true,
  });
  void serve({ projectRoot: PROJ, onStatus: () => {} });
  await wait(700);

  // 1) happy path: append_memory (allowed cap) -> approve -> executed + file written
  const a1 = requestAction({ projectId: "proj-x", tool: "append_memory", args: { actor: "agent", kind: "decision", summary: "saved from chat" }, summary: "save" });
  const a1done = await approveAction(a1.id);
  const memDir = join(PROJ, ".MOP", "memory");
  const wrote =
    existsSync(memDir) &&
    readdirSync(memDir).some((f) => readFileSync(join(memDir, f), "utf8").includes("saved from chat"));
  console.log(`[test] append_memory: status=${a1done?.status} wroteToFlow=${wrote}`);

  // 2) deny path
  const a2 = requestAction({ projectId: "proj-x", tool: "append_memory", args: { summary: "nope" } });
  const a2done = denyAction(a2.id);
  console.log(`[test] deny: status=${a2done?.status}`);

  // 3) capability-denied path: write_artifact while cap is off -> approve -> failed
  const a3 = requestAction({ projectId: "proj-x", tool: "write_artifact", args: { path: "x.md", content: "hi" } });
  const a3done = await approveAction(a3.id);
  console.log(`[test] write_artifact (cap off): status=${a3done?.status} error=${a3done?.error}`);

  const ok =
    a1done?.status === "executed" && wrote &&
    a2done?.status === "denied" &&
    a3done?.status === "failed" && /capability_denied/.test(a3done?.error ?? "");

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
