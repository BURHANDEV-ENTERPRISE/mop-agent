/**
 * Smoke test: end-to-end link loop WITH the DB (Fasa 2).
 * gateway (AGENT) + serve (FLOW) over a real localhost WebSocket, persisting to
 * SQLite + sqlite-vec. Uses an isolated temp data dir.
 *
 *   npx tsx scripts/smoke-link.mts
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated DB for the test — MUST be set before importing db client.
process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-test-"));

const { createServer } = await import("node:http");
const { attachGateway, callFlow, isOnline } = await import("../apps/web/lib/ws/gateway.js");
const { registerProject } = await import("../apps/web/lib/link/store.js");
const { getMirror } = await import("../apps/web/lib/brain/mirror.js");
const { semanticSearch } = await import("../apps/web/lib/memory/embed.js");
const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { writeLink } = await import("../packages/flow-connector/src/linkfile.js");
const { serve } = await import("../packages/flow-connector/src/serve.js");
const { DEFAULT_CAPABILITIES } = await import("../packages/link-protocol/src/index.js");

const PORT = 3999;
// Isolate the FLOW fixture too. A fixed /tmp path retained append_memory rows
// from earlier runs and made the expected snapshot count nondeterministic.
const ROOT = mkdtempSync(join(tmpdir(), "mop-test-proj-"));

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const mopDir = join(ROOT, ".MOP");
  const memoryDir = join(mopDir, "memory");
  mkdirSync(memoryDir, { recursive: true });
  writeFileSync(
    join(mopDir, "STATE.json"),
    JSON.stringify({
      schemaVersion: "1.2.0",
      projectName: "test-proj",
      autosync: { token: "SECRET_SHOULD_BE_REDACTED" },
    }),
  );
  writeFileSync(
    join(memoryDir, "fixture.jsonl"),
    [
      { id: "mem-1", at: 1718900000000, actor: "moon", kind: "decision", summary: "use reverse WSS for the link" },
      { id: "mem-2", at: 1718900100000, actor: "moon", kind: "fix", summary: "exponential backoff on websocket reconnect" },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n",
  );

  await runAllMigrations();
  console.log("[test] migrated DB");

  const server = createServer();
  attachGateway(server);
  await new Promise<void>((r) => server.listen(PORT, r));

  const { linkToken } = registerProject({
    projectId: "test-proj",
    name: "Test Project",
    mopFlowVersion: "1.3.0-dev",
    platform: "linux",
    capabilities: DEFAULT_CAPABILITIES,
  });

  await writeLink(ROOT, {
    schemaVersion: "1.0",
    agentUrl: `http://localhost:${PORT}`,
    wsUrl: `ws://localhost:${PORT}/link`,
    projectId: "test-proj",
    linkToken,
    capabilities: DEFAULT_CAPABILITIES,
    lastSyncAt: null,
    autoSync: true,
  });
  void serve({ projectRoot: ROOT, onStatus: (s) => console.log(`[flow] ${s}`) });

  await wait(1000);

  const online = isOnline("test-proj");
  const mirror = getMirror("test-proj");
  const search = await semanticSearch("reverse websocket reconnect backoff", 3);

  console.log(`\n[test] online=${online}`);
  console.log(`[test] mirror memories=${mirror?.memoryCount ?? 0}`);
  console.log(`[test] state redacted? ${JSON.stringify(mirror?.state)}`);
  console.log(`[test] vector search top hit: ${JSON.stringify(search[0])}`);

  const res = (await callFlow("test-proj", "append_memory", {
    actor: "agent",
    kind: "conversation",
    summary: "written from AGENT over the link",
  })) as { ok?: boolean };
  console.log(`[test] append_memory ok=${res.ok}`);

  const ok =
    online &&
    (mirror?.memoryCount ?? 0) === 2 &&
    !JSON.stringify(mirror?.state).includes("SECRET_SHOULD_BE_REDACTED") &&
    search.length > 0 &&
    !!res.ok;

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
