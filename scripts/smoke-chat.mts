/**
 * Smoke test: grounded recall + chat (offline echo provider).
 *   npx tsx scripts/smoke-chat.mts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOP_AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "mop-agent-chat-"));

const { runAllMigrations } = await import("../apps/web/lib/db/migrate.js");
const { ingestSnapshot } = await import("../apps/web/lib/brain/mirror.js");
const { recall } = await import("../apps/web/lib/brain/broker.js");
const { echoProvider } = await import("../apps/web/lib/providers/index.js");

async function main() {
  await runAllMigrations();

  await ingestSnapshot({
    t: "snapshot.push",
    projectId: "proj-a",
    state: {},
    memory: [
      { id: "m1", kind: "decision", summary: "auth gate is per-session; every new chat re-authenticates", at: Date.now() },
      { id: "m2", kind: "fix", summary: "use exponential backoff when the websocket link drops", at: Date.now() },
      { id: "m3", kind: "decision", summary: "store provider keys encrypted with AES-GCM", at: Date.now() },
    ],
    artifacts: [],
  });
  console.log("[test] ingested 3 memories");

  const pack = await recall({ query: "how does the authentication gate work?", projectId: "proj-a" });
  console.log(`[test] recalled episodic=${pack.episodic.length}`);
  const top = pack.episodic[0];
  console.log(`[test] top memory: ${top?.summary}`);

  const system = `You are the MOP-AGENT brain.\n\n${pack.toPromptString()}`;
  let answer = "";
  for await (const d of echoProvider().chat({ system, messages: [{ role: "user", content: "how does the authentication gate work?" }] })) {
    answer += d;
  }
  console.log(`\n[test] answer:\n${answer}`);

  // NOTE: ranking quality is the real embedder's job (backlog). Here we verify the
  // plumbing: the auth memory is recalled (present), and the answer is grounded.
  const hasAuthMemory = pack.episodic.some((m) => /per-session|auth gate|authenticat/i.test(m.summary));
  const centralPack = await recall({
    query: "how does the authentication gate work?",
    allowCrossProject: true,
  });
  const centralAssistantWorksWithoutProject = centralPack.episodic.some((m) => m.id === "m1");
  const ok =
    pack.episodic.length > 0 &&
    !!top &&
    hasAuthMemory &&
    centralAssistantWorksWithoutProject &&
    /auth|per-session|memory/i.test(answer);

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
