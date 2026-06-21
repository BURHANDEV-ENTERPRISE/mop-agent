/**
 * Smoke test: capability-gated execution (run_shell host backend + edit_code + guards).
 *   npx tsx scripts/smoke-exec.mts
 */
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleToolRequest, CapabilityError, type ToolContext } from "../packages/flow-connector/src/tools.js";
import { DEFAULT_CAPABILITIES } from "../packages/link-protocol/src/index.js";

const ROOT = mkdtempSync(join(tmpdir(), "mop-exec-"));

async function expectError(fn: () => Promise<unknown>, match: RegExp): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof CapabilityError && match.test(e.message);
  }
}

async function main() {
  // run_shell with capability OFF -> denied
  const ctxOff: ToolContext = { projectRoot: ROOT, capabilities: DEFAULT_CAPABILITIES };
  const denied = await expectError(() => handleToolRequest("run_shell", { command: "echo hi" }, ctxOff), /capability_denied:runShell/);
  console.log(`[test] run_shell denied when cap off: ${denied}`);

  // capability ON (host backend)
  const ctxOn: ToolContext = {
    projectRoot: ROOT,
    capabilities: { ...DEFAULT_CAPABILITIES, runShell: true, editCode: true },
    execution: { backend: "host", timeoutMs: 10_000 },
  };

  const shellRes = (await handleToolRequest("run_shell", { command: "echo mop-exec-ok && pwd" }, ctxOn)) as { stdout: string; code: number };
  console.log(`[test] run_shell stdout: ${shellRes.stdout.trim().split("\n")[0]} (code ${shellRes.code})`);

  // edit_code writes a file inside the project
  const edit = (await handleToolRequest("edit_code", { path: "src/hello.txt", content: "hello from edit_code" }, ctxOn)) as { ok: boolean; path: string };
  const wrote = existsSync(join(ROOT, "src/hello.txt")) && readFileSync(join(ROOT, "src/hello.txt"), "utf8").includes("edit_code");
  console.log(`[test] edit_code wrote file: ${edit.ok && wrote}`);

  // edit_code path traversal -> blocked
  const escaped = await expectError(() => handleToolRequest("edit_code", { path: "../../etc/evil", content: "x" }, ctxOn), /path_escapes_project_root/);
  console.log(`[test] edit_code path traversal blocked: ${escaped}`);

  const ok = denied && shellRes.stdout.includes("mop-exec-ok") && shellRes.code === 0 && edit.ok && wrote && escaped;
  console.log(`\n[test] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
