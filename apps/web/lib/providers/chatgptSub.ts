/**
 * ChatGPT subscription inference (EXPERIMENTAL).
 *
 * Subscription OAuth tokens can't call the public /chat/completions API. Like the
 * Codex CLI, this drives the ChatGPT backend "Responses" endpoint with the OAuth
 * bearer token. Undocumented + ToS-sensitive + brittle (may break whenever OpenAI
 * changes the backend). If a request fails the provider throws and the chain falls
 * through to the next provider.
 */
import { randomUUID } from "node:crypto";
import type { ChatProvider, ChatOptions } from "./types";

const RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";

/** ChatGPT account id is carried as a claim inside the OAuth access token (JWT). */
function accountIdFromToken(accessToken: string): string | undefined {
  try {
    const payloadB64 = accessToken.split(".")[1];
    if (!payloadB64) return undefined;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8")) as Record<string, unknown>;
    const authClaim = payload["https://api.openai.com/auth"] as Record<string, unknown> | undefined;
    return (authClaim?.chatgpt_account_id as string | undefined) ?? (payload.chatgpt_account_id as string | undefined);
  } catch {
    return undefined;
  }
}

export function chatgptSubProvider(accessToken: string, model = "gpt-5"): ChatProvider {
  const accountId = accountIdFromToken(accessToken);
  return {
    id: "chatgpt-sub",
    model,
    async *chat({ system, messages }: ChatOptions) {
      const input = messages.map((m) => ({
        type: "message",
        role: m.role,
        content: [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content }],
      }));

      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${accessToken}`,
        "openai-beta": "responses=experimental",
        originator: "codex_cli_rs",
        session_id: randomUUID(),
      };
      if (accountId) headers["chatgpt-account-id"] = accountId;

      const response = await fetch(RESPONSES_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, instructions: system ?? "", input, stream: true, store: false }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(`chatgpt_sub_${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
      }

      // Parse the SSE stream and yield text deltas.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          for (const line of block.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const event = JSON.parse(data) as { type?: string; delta?: unknown };
              if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
                yield event.delta;
              }
            } catch {
              /* ignore keep-alive / non-JSON lines */
            }
          }
        }
      }
    },
  };
}
