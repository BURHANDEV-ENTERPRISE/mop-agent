/**
 * Non-streaming grounded answer (recall + provider) — used by channels and any
 * non-SSE caller. /api/chat keeps its own streaming variant.
 */
import { recall } from "./broker";
import { resolveProvider } from "../providers";

export async function groundedAnswerText(
  projectId: string,
  message: string,
  opts?: { allowCrossProject?: boolean },
): Promise<{ text: string; provider: string; contextCount: number }> {
  const pack = await recall({ query: message, projectId, allowCrossProject: opts?.allowCrossProject });
  const provider = resolveProvider();
  const system = [
    "You are the MOP-AGENT brain. Answer using the project context below when relevant.",
    "If the context is empty, say so plainly.",
    "",
    pack.toPromptString(),
  ].join("\n");

  let text = "";
  for await (const delta of provider.chat({ system, messages: [{ role: "user", content: message }] })) {
    text += delta;
  }
  return { text, provider: provider.id, contextCount: pack.episodic.length + pack.semantic.length };
}
