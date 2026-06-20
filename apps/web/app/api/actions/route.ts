/**
 * GET  /api/actions  — list pending/recent write actions (owner).
 * POST /api/actions  — request a write action { projectId, tool, args, summary } (owner).
 */
import type { McpToolName } from "@mop/link-protocol";
import { auth } from "@/lib/auth";
import { listActions, requestAction } from "@/lib/brain/approvals";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ actions: listActions() });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    projectId: string;
    tool: McpToolName;
    args: Record<string, unknown>;
    summary?: string;
  };
  if (!body?.projectId || !body?.tool) {
    return Response.json({ error: "missing_projectId_or_tool" }, { status: 400 });
  }
  const action = requestAction(body);
  return Response.json({ action });
}
