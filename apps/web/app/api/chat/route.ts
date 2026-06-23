/**
 * POST /api/chat — grounded chat. Owner session -> recall project context ->
 * stream the provider's answer. projectId is optional for the main assistant.
 * Body: { message, projectId?, allowCrossProject? }
 */
import { auth } from "@/lib/auth";
import { recall } from "@/lib/brain/broker";
import { saveChatMemory } from "@/lib/brain/chatMemory";
import { resolveProvider } from "@/lib/providers";
import type { ChatImage } from "@/lib/providers/types";

type ChatTool = "image" | "web" | "code" | "research" | "think";

const TOOL_INSTRUCTIONS: Record<ChatTool, string> = {
  image: "The user selected image creation. Produce a precise image-generation brief or image-oriented response.",
  web: "The user selected web search. Clearly separate recalled knowledge from facts that require a live web source; never invent browsing results.",
  code: "The user selected writing/code. Give implementation-ready, technically precise output.",
  research: "The user selected deep research. Analyze methodically, compare alternatives, and state uncertainties.",
  think: "The user selected extended thinking. Check assumptions carefully before answering.",
};

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { projectId, message, allowCrossProject, tool, image } = (await req.json()) as {
    projectId?: string;
    message: string;
    allowCrossProject?: boolean;
    tool?: ChatTool | null;
    image?: ChatImage | null;
  };
  if ((typeof message !== "string" || !message.trim()) && !image) {
    return Response.json({ error: "missing_message" }, { status: 400 });
  }
  if (tool && !Object.hasOwn(TOOL_INSTRUCTIONS, tool)) {
    return Response.json({ error: "unknown_tool" }, { status: 400 });
  }
  if (image && (!image.dataUrl?.startsWith("data:image/") || image.dataUrl.length > 7_000_000)) {
    return Response.json({ error: "invalid_or_oversized_image" }, { status: 400 });
  }

  const userMessage = message.trim() || "Help me understand this attached image.";

  const centralAssistant = !projectId;
  const pack = await recall({
    query: userMessage,
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
    tool ? TOOL_INSTRUCTIONS[tool] : "",
    "",
    pack.toPromptString(),
  ].join("\n");

  const actor = session.user.name || session.user.email || "user";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      try {
        for await (const delta of provider.chat({ system, messages: [{ role: "user", content: userMessage, image: image ?? undefined }] })) {
          answer += delta;
          controller.enqueue(encoder.encode(delta));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`\n[provider error: ${e instanceof Error ? e.message : String(e)}]`));
      } finally {
        // Persist the exchange as memory. Central assistant → Main Brain bucket;
        // a project chat → that project. Skip the offline echo placeholder.
        if (provider.id !== "echo" && answer.trim()) {
          try {
            await saveChatMemory({ projectId, actor, userMessage, answer });
          } catch {
            /* memory persistence is best-effort; never break the response */
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Provider": provider.id },
  });
}
