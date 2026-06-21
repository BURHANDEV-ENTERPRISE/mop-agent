/**
 * POST /api/chat — grounded chat. Owner session -> recall project context ->
 * stream the provider's answer. projectId is optional for the main assistant.
 * Body: { message, projectId?, allowCrossProject? }
 */
import { auth } from "@/lib/auth";
import { recall } from "@/lib/brain/broker";
import { resolveProvider } from "@/lib/providers";

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { projectId, message, allowCrossProject } = (await req.json()) as {
    projectId?: string;
    message: string;
    allowCrossProject?: boolean;
  };
  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "missing_message" }, { status: 400 });
  }

  const centralAssistant = !projectId;
  const pack = await recall({
    query: message.trim(),
    projectId,
    // The main assistant is the authenticated, cross-project surface.
    allowCrossProject: centralAssistant || !!allowCrossProject,
  });
  const provider = resolveProvider(session.user.id);

  const system = [
    "You are MOP-AGENT, a self-hosted AI assistant with persistent memory.",
    centralAssistant
      ? "Help the user directly. Use the available cross-project memory when relevant; a linked project is not required."
      : "Help the user with the selected project and use its memory when relevant.",
    "",
    pack.toPromptString(),
  ].join("\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of provider.chat({ system, messages: [{ role: "user", content: message.trim() }] })) {
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
