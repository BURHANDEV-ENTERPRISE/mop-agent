/**
 * Smoke test: FLOW read tools (list_artifacts, workflow_status, search_project_context).
 *   npx tsx scripts/smoke-flowtools.mts
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleToolRequest, type ToolContext } from "../packages/flow-connector/src/tools.js";
import { DEFAULT_CAPABILITIES } from "../packages/link-protocol/src/index.js";

const ROOT = mkdtempSync(join(tmpdir(), "mop-flowtools-"));
mkdirSync(join(ROOT, ".MOP", "memory"), { recursive: true });
mkdirSync(join(ROOT, ".MOP", "artifacts", "docs"), { recursive: true });

writeFileSync(join(ROOT, ".MOP", "STATE.json"), JSON.stringify({ workflow: { currentPhase: "architecture", profile: "engineering" } }));
writeFileSync(join(ROOT, ".MOP", "artifacts", "ARCHITECTURE.md"), "# Arch");
writeFileSync(join(ROOT, ".MOP", "artifacts", "docs", "DECISIONS.md"), "# Decisions");
writeFileSync(join(ROOT, ".MOP", "memory", "2026-06.jsonl"),
  '{"id":"m1","summary":"use reverse websocket for the link"}\n{"id":"m2","summary":"bill invoices monthly"}\n');

const ctx: ToolContext = { projectRoot: ROOT, capabilities: DEFAULT_CAPABILITIES };

async function main() {
  const artifacts = (await handleToolRequest("list_artifacts", {}, ctx)) as Array<{ path: string }>;
  const wf = (await handleToolRequest("workflow_status", {}, ctx)) as { workflow: { currentPhase?: string } | null };
  const search = (await handleToolRequest("search_project_context", { query: "websocket link" }, ctx)) as Array<{ id: string }>;

  console.log(`[test] artifacts: ${artifacts.map((a) => a.path).join(", ")}`);
  console.log(`[test] workflow phase: ${wf.workflow?.currentPhase}`);
  console.log(`[test] search top: ${search[0]?.id}`);

  const ok =
    artifacts.length === 2 &&
    artifacts.some((a) => a.path.includes("DECISIONS.md")) &&
    wf.workflow?.currentPhase === "architecture" &&
    search.length === 1 && search[0]?.id === "m1";

  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
