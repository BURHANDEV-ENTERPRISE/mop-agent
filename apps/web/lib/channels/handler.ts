/**
 * Platform-neutral channel message handler. Telegram/Discord adapters call this
 * with a namespaced channelKey ("telegram:123", "discord:456") and the text;
 * it handles commands and otherwise answers grounded on the bound project.
 */
import { listProjects } from "../link/store";
import { groundedAnswerText } from "../brain/answer";
import { resolveProject, setBinding } from "./binding";

const HELP = [
  "🧠 MOP-AGENT brain.",
  "Commands:",
  "• /projects — list linked projects",
  "• /use <id> — bind this chat to a project",
  "Then just ask a question.",
].join("\n");

export async function handleIncoming(channelKey: string, text: string): Promise<string> {
  const t = (text ?? "").trim();
  if (!t) return "";

  if (t === "/help" || t === "/start") return HELP;

  if (t === "/projects") {
    const ps = listProjects();
    return ps.length
      ? "Projects:\n" + ps.map((p) => `• ${p.id} (${p.status})`).join("\n")
      : "No projects linked yet.";
  }

  if (t.startsWith("/use ")) {
    const id = t.slice(5).trim();
    if (!listProjects().some((p) => p.id === id)) return `Unknown project: "${id}". Try /projects.`;
    setBinding(channelKey, id);
    return `✅ This chat is now bound to "${id}". Ask away.`;
  }

  const projectId = resolveProject(channelKey);
  if (!projectId) return "Which project? Use /projects then /use <id>.";

  const { text: answer, provider } = await groundedAnswerText(projectId, t);
  const note = provider === "echo" ? "\n\n(echo — set ANTHROPIC_API_KEY/OPENROUTER_API_KEY for real answers)" : "";
  return `${answer}${note}`;
}
