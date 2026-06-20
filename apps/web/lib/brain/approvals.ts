/**
 * Approval queue for AGENT → FLOW write actions (Fasa 4).
 *
 * Security model: writes (append_memory / write_artifact / workflow_next / shell …)
 * never auto-execute. They land here as pending, the owner approves, then we send
 * them down the live link. FLOW re-checks capability + session regardless (the
 * approval flag is never trusted FLOW-side — defense in depth).
 *
 * In-memory + globalThis (pending actions are transient; survive Next bundle split).
 */
import { randomUUID } from "node:crypto";
import { isReadTool, type McpToolName } from "@mop/link-protocol";
import { callFlow, isOnline } from "../ws/gateway";

export type ActionStatus = "pending" | "denied" | "executed" | "failed";

export type Action = {
  id: string;
  projectId: string;
  tool: McpToolName;
  args: Record<string, unknown>;
  summary: string;
  status: ActionStatus;
  createdAt: number;
  result?: unknown;
  error?: string;
};

const g = globalThis as unknown as { __mopActions?: Map<string, Action> };
const actions = (g.__mopActions ??= new Map<string, Action>());

export function requestAction(input: {
  projectId: string;
  tool: McpToolName;
  args: Record<string, unknown>;
  summary?: string;
}): Action {
  const action: Action = {
    id: `act-${randomUUID().slice(0, 8)}`,
    projectId: input.projectId,
    tool: input.tool,
    args: input.args,
    summary: input.summary ?? `${input.tool} on ${input.projectId}`,
    status: "pending",
    createdAt: Date.now(),
  };
  actions.set(action.id, action);
  return action;
}

export function listActions(): Action[] {
  return [...actions.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function denyAction(id: string): Action | undefined {
  const a = actions.get(id);
  if (a && a.status === "pending") a.status = "denied";
  return a;
}

/** Approve → execute over the live link. FLOW enforces capability + session. */
export async function approveAction(id: string): Promise<Action | undefined> {
  const a = actions.get(id);
  if (!a || a.status !== "pending") return a;

  // Read tools never needed approval, but allow execution anyway.
  if (!isReadTool(a.tool) && !isOnline(a.projectId)) {
    a.status = "failed";
    a.error = "project_offline";
    return a;
  }

  try {
    a.result = await callFlow(a.projectId, a.tool, a.args);
    a.status = "executed";
  } catch (e) {
    a.status = "failed";
    a.error = e instanceof Error ? e.message : String(e);
  }
  return a;
}
