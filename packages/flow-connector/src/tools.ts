/**
 * Tool request handler (AGENT -> FLOW).
 *
 * THE capability guard. FLOW is the source of truth for permissions — even if the
 * AGENT claims a write was "approved", FLOW re-checks the capability (and, for
 * writes, a valid session) before doing anything. Defense in depth.
 */
import { readFile, writeFile, mkdir, appendFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULT_EXECUTION_POLICY,
  isReadTool,
  TOOL_CAPABILITY,
  type Capabilities,
  type ExecutionPolicy,
  type McpToolName,
} from "@mop/link-protocol";
import { runShell } from "./exec.js";

export type ToolContext = {
  projectRoot: string;
  capabilities: Capabilities;
  /** Hook into the real .MOP session check (v1.2.0). Returns true if actor holds a valid session. */
  hasValidSession?: (actor?: string) => Promise<boolean> | boolean;
  /** Required for run_shell / edit_code; defaults to host backend. */
  execution?: ExecutionPolicy;
};

export class CapabilityError extends Error {}

export async function handleToolRequest(
  tool: McpToolName,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  // 1) Guard
  if (!isReadTool(tool)) {
    const cap = TOOL_CAPABILITY[tool as keyof typeof TOOL_CAPABILITY];
    if (!cap || !ctx.capabilities[cap]) {
      throw new CapabilityError(`capability_denied:${cap ?? tool}`);
    }
    const ok = ctx.hasValidSession ? await ctx.hasValidSession(args.actor as string | undefined) : true;
    if (!ok) throw new CapabilityError("no_valid_session");
  }

  // 2) Dispatch
  switch (tool) {
    case "get_project_state":
      return readJson(join(ctx.projectRoot, ".MOP", "STATE.json"));
    case "list_memory":
      return listMemory(ctx.projectRoot, Number(args.limit ?? 50));
    case "read_artifact":
      return readText(join(ctx.projectRoot, ".MOP", "artifacts", String(args.path)));
    case "list_artifacts":
      return listArtifacts(ctx.projectRoot);
    case "workflow_status":
      return workflowStatus(ctx.projectRoot);
    case "search_project_context":
      return searchContext(ctx.projectRoot, String(args.query ?? ""));
    case "append_memory":
      return appendMemory(ctx.projectRoot, args);
    case "write_artifact":
      return writeArtifact(ctx.projectRoot, String(args.path), String(args.content));
    case "workflow_next":
      return { note: "TODO: advance workflow via mop-core" };
    case "run_shell": {
      // Reaches here only if capabilities.runShell is granted (see §9.1).
      const policy = ctx.execution ?? DEFAULT_EXECUTION_POLICY;
      return runShell(String(args.command ?? ""), ctx.projectRoot, policy);
    }
    case "edit_code":
      // Reaches here only if capabilities.editCode is granted.
      return editCode(ctx.projectRoot, String(args.path), String(args.content));
    default:
      throw new CapabilityError(`unknown_tool:${tool}`);
  }
}

// --- helpers -------------------------------------------------------------

async function readJson(p: string): Promise<unknown> {
  if (!existsSync(p)) return {};
  return JSON.parse(await readFile(p, "utf8"));
}

async function readText(p: string): Promise<string> {
  return readFile(p, "utf8");
}

async function listMemory(projectRoot: string, limit: number): Promise<unknown[]> {
  const dir = join(projectRoot, ".MOP", "memory");
  if (!existsSync(dir)) return [];
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl")).sort().reverse();
  const out: unknown[] = [];
  for (const f of files) {
    const raw = await readFile(join(dir, f), "utf8");
    for (const line of raw.split("\n").reverse()) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        /* skip */
      }
      if (out.length >= limit) return out;
    }
  }
  return out;
}

async function appendMemory(projectRoot: string, args: Record<string, unknown>): Promise<{ ok: true; id: string }> {
  const now = new Date();
  const id = `mem-${now.getTime().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const entry = {
    id,
    at: now.getTime(),
    actor: args.actor ?? "agent",
    kind: args.kind ?? "conversation",
    summary: String(args.summary ?? ""),
    body: args.body,
  };
  const file = join(
    projectRoot,
    ".MOP",
    "memory",
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}.jsonl`,
  );
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(entry) + "\n", "utf8");
  return { ok: true, id };
}

async function writeArtifact(projectRoot: string, relPath: string, content: string): Promise<{ ok: true; path: string }> {
  const p = join(projectRoot, ".MOP", "artifacts", relPath);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
  return { ok: true, path: relPath };
}

async function listArtifacts(projectRoot: string): Promise<Array<{ path: string; updatedAt: number; size: number }>> {
  const dir = join(projectRoot, ".MOP", "artifacts");
  if (!existsSync(dir)) return [];
  const out: Array<{ path: string; updatedAt: number; size: number }> = [];
  const walk = async (d: string, base: string): Promise<void> => {
    for (const name of await readdir(d)) {
      const full = join(d, name);
      const s = await stat(full);
      if (s.isDirectory()) await walk(full, join(base, name));
      else out.push({ path: join(base, name), updatedAt: s.mtimeMs, size: s.size });
    }
  };
  await walk(dir, "");
  return out;
}

async function workflowStatus(projectRoot: string): Promise<unknown> {
  const p = join(projectRoot, ".MOP", "STATE.json");
  if (!existsSync(p)) return { workflow: null };
  const state = JSON.parse(await readFile(p, "utf8")) as { workflow?: unknown };
  return { workflow: state.workflow ?? null };
}

async function searchContext(projectRoot: string, query: string): Promise<Array<{ id: string; summary: string; score: number }>> {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length >= 2);
  if (!terms.length) return [];
  const dir = join(projectRoot, ".MOP", "memory");
  if (!existsSync(dir)) return [];
  const hits: Array<{ id: string; summary: string; score: number }> = [];
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".jsonl"))) {
    for (const line of (await readFile(join(dir, f), "utf8")).split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const m = JSON.parse(t) as { id: string; summary?: string; body?: string };
        const hay = `${m.summary ?? ""} ${m.body ?? ""}`.toLowerCase();
        const score = terms.reduce((s, term) => s + (hay.includes(term) ? 1 : 0), 0);
        if (score > 0) hits.push({ id: m.id, summary: m.summary ?? "", score });
      } catch {
        /* skip */
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 20);
}

/** edit_code: write a project source file, refusing paths that escape the project root. */
async function editCode(projectRoot: string, relPath: string, content: string): Promise<{ ok: true; path: string }> {
  const root = resolve(projectRoot);
  const target = resolve(root, relPath);
  if (target !== root && !target.startsWith(root + (process.platform === "win32" ? "\\" : "/"))) {
    throw new CapabilityError("path_escapes_project_root");
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return { ok: true, path: relPath };
}
