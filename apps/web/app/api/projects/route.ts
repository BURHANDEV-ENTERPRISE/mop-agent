/**
 * GET /api/projects — linked projects + their live status and mirror summary.
 */
import { listProjects } from "@/lib/link/store";
import { getMirror } from "@/lib/brain/mirror";

export async function GET(): Promise<Response> {
  const projects = listProjects().map((p) => {
    const mirror = getMirror(p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      mopFlowVersion: p.mopFlowVersion,
      lastSeenAt: p.lastSeenAt,
      memoryCount: mirror?.memoryCount ?? 0,
      artifactCount: mirror?.artifacts.length ?? 0,
    };
  });
  return Response.json({ projects });
}
