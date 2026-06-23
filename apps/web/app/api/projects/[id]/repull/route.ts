/**
 * POST /api/projects/:id/repull — pull a project's memory again over the live link
 * (owner only). Calls the FLOW list_memory tool and re-ingests, so the Brain
 * reflects the project's current memory + online status without waiting for the
 * next automatic snapshot push. Requires the project to be online.
 */
import { requireRole } from "@/lib/authz";
import { ingestMemoryList } from "@/lib/brain/mirror";
import { callFlow, isOnline } from "@/lib/ws/gateway";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const a = await requireRole(req, ["owner"]);
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  if (!isOnline(id)) {
    return Response.json({ ok: false, online: false, error: "project_offline" }, { status: 409 });
  }
  try {
    const result = await callFlow(id, "list_memory", { limit: 100000 });
    const list = (Array.isArray(result) ? result : (result as { memory?: unknown[] })?.memory ?? []) as Array<
      Record<string, unknown>
    >;
    const pulled = await ingestMemoryList(id, list);
    return Response.json({ ok: true, online: true, pulled });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "repull_failed" }, { status: 400 });
  }
}
