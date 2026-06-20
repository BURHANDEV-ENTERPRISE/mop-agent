/**
 * @mop/link-protocol
 *
 * Shared types and message schemas for the MOP-AGENT <-> MOP-FLOW link.
 * Imported by both `apps/web` (AGENT side) and `packages/flow-connector` (FLOW side)
 * so the wire contract stays in exactly one place.
 *
 * Transport: FLOW dials OUT to AGENT over WSS (reverse tunnel). See PRD §3 / FLOW §4.
 */

export const LINK_PROTOCOL_VERSION = "1.0" as const;

/** Default WSS path the AGENT exposes for FLOW connections. */
export const LINK_WS_PATH = "/link" as const;

// ---------------------------------------------------------------------------
// Capabilities — what an AGENT is allowed to do against a linked project.
// Enforced FLOW-side (defense in depth); AGENT can only request.
// ---------------------------------------------------------------------------

export type Capabilities = {
  readMemory: boolean;
  writeMemory: boolean;
  readArtifacts: boolean;
  writeArtifacts: boolean;
  runWorkflow: boolean;
  runShell: boolean;
  editCode: boolean;
};

/** Safe defaults: read freely, controlled writes, no shell/code edits. */
export const DEFAULT_CAPABILITIES: Capabilities = {
  readMemory: true,
  writeMemory: true,
  readArtifacts: true,
  writeArtifacts: true,
  runWorkflow: true,
  runShell: false,
  editCode: false,
};

// ---------------------------------------------------------------------------
// Project manifest — sent FLOW -> AGENT at pairing time.
// ---------------------------------------------------------------------------

export type Platform = "win32" | "linux" | "darwin" | string;

export type ProjectManifest = {
  projectId: string;
  name: string;
  mopFlowVersion: string;
  platform: Platform;
  workflow?: {
    currentPhase?: string;
    profile?: string;
  };
  capabilities: Capabilities;
};

// ---------------------------------------------------------------------------
// Brain payload types (mirrored on the AGENT side).
// ---------------------------------------------------------------------------

export type MemoryKind =
  | "decision"
  | "conversation"
  | "artifact"
  | "workflow"
  | "problem"
  | "fix"
  | "preference"
  | "skill";

export type MemoryEntry = {
  id: string;
  kind: MemoryKind | string;
  summary: string;
  body?: string;
  actor?: string;
  /** epoch millis */
  at: number;
  /** episodic memory is private by default (judgment layer) */
  private?: boolean;
  tags?: string[];
};

export type ArtifactRef = {
  path: string;
  title?: string;
  /** epoch millis */
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// MCP tool surface FLOW exposes to AGENT (over the live link).
// ---------------------------------------------------------------------------

export type McpReadTool =
  | "get_project_state"
  | "list_artifacts"
  | "read_artifact"
  | "list_memory"
  | "workflow_status"
  | "search_project_context";

export type McpWriteTool =
  | "write_artifact"
  | "append_memory"
  | "workflow_next";

/** Future, capability-gated, off by default. */
export type McpDangerousTool = "run_shell" | "edit_code";

export type McpToolName = McpReadTool | McpWriteTool | McpDangerousTool;

/** Maps each write/dangerous tool to the capability it requires. */
export const TOOL_CAPABILITY: Record<McpWriteTool | McpDangerousTool, keyof Capabilities> = {
  write_artifact: "writeArtifacts",
  append_memory: "writeMemory",
  workflow_next: "runWorkflow",
  run_shell: "runShell",
  edit_code: "editCode",
};

export const READ_TOOLS: ReadonlySet<string> = new Set<McpReadTool>([
  "get_project_state",
  "list_artifacts",
  "read_artifact",
  "list_memory",
  "workflow_status",
  "search_project_context",
]);

// ---------------------------------------------------------------------------
// Wire messages (both directions over the WSS link).
// `t` is the discriminator.
// ---------------------------------------------------------------------------

export type HelloMessage = {
  t: "hello";
  capabilities: Capabilities;
  /** epoch millis on the AGENT */
  serverTime: number;
  protocolVersion: typeof LINK_PROTOCOL_VERSION;
};

export type SnapshotPushMessage = {
  t: "snapshot.push";
  projectId: string;
  /** redacted STATE.json (secrets stripped FLOW-side) */
  state: unknown;
  memory: MemoryEntry[];
  artifacts: ArtifactRef[];
};

/** AGENT -> FLOW: request a tool call. */
export type ReqMessage = {
  t: "req";
  id: string;
  tool: McpToolName;
  args: Record<string, unknown>;
};

/** FLOW -> AGENT: response to a `req`. */
export type ResMessage = {
  t: "res";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
};

/** FLOW -> AGENT: spontaneous events (memory changed, workflow advanced, etc.). */
export type EventMessage = {
  t: "event";
  name: string;
  payload: unknown;
};

export type PingMessage = { t: "ping" };
export type PongMessage = { t: "pong" };

export type LinkMessage =
  | HelloMessage
  | SnapshotPushMessage
  | ReqMessage
  | ResMessage
  | EventMessage
  | PingMessage
  | PongMessage;

// ---------------------------------------------------------------------------
// Pairing (HTTP, before the WSS link is established).
// ---------------------------------------------------------------------------

/** FLOW -> AGENT  POST /api/link/pair */
export type PairRequest = {
  code: string;
  manifest: ProjectManifest;
};

/** AGENT -> FLOW  response */
export type PairResponse = {
  projectId: string;
  /** bearer token used for the WSS Authorization header; stored in .MOP/link.json */
  linkToken: string;
  wsUrl: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Narrowing helper for received frames. */
export function parseLinkMessage(raw: string): LinkMessage {
  const msg = JSON.parse(raw) as LinkMessage;
  if (typeof (msg as { t?: unknown }).t !== "string") {
    throw new Error("invalid link message: missing discriminator `t`");
  }
  return msg;
}

/** True if a tool is a read-only tool (no capability required). */
export function isReadTool(tool: string): boolean {
  return READ_TOOLS.has(tool);
}
