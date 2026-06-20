/**
 * POST /api/chat — grounded chat. Owner session -> recall project context ->
 * stream the provider's answer. Body: { projectId, message, allowCrossProject? }
 */
import { auth } from "@/lib/auth";
import { recall } from "@/lib/brain/broker";
import { resolveProvider } from "@/lib/providers";

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { projectId, message, allowCrossProject } = (await req.json()) as {
    projectId: string;
    message: string;
    allowCrossProject?: boolean;
  };
  if (!projectId || !message) {
    return Response.json({ error: "missing_projectId_or_message" }, { status: 400 });
  }

  const pack = await recall({ query: message, projectId, allowCrossProject: !!allowCrossProject });
  const provider = resolveProvider(session.user.id);

  const system = [
    "You are the MOP-AGENT brain. Answer using the project context below when relevant.",
    "If the context is empty, say so plainly.",
    "",
    pack.toPromptString(),
  ].join("\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of provider.chat({ system, messages: [{ role: "user", content: message }] })) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`\n[provider error: ${e instanceof Error ? e.message : String(e)}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Provider": provider.id },
  });
}
