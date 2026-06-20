import type { ChatProvider, ChatOptions } from "./types";

/**
 * Offline provider — no API key. Echoes a deterministic answer that proves the
 * grounding pipeline (it reflects the injected context + question). Used as the
 * default fallback and in smoke tests.
 */
export function echoProvider(): ChatProvider {
  return {
    id: "echo",
    model: "echo-1",
    async *chat({ system, messages }: ChatOptions) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const ctxLines = (system ?? "")
        .split("\n")
        .filter((l) => l.trim().startsWith("- "))
        .slice(0, 5);
      yield `🧠 (echo) You asked: "${lastUser}".\n\n`;
      if (ctxLines.length) {
        yield `Based on project memory I can see:\n${ctxLines.join("\n")}\n`;
      } else {
        yield `No project context was retrieved for this query.\n`;
      }
    },
  };
}
