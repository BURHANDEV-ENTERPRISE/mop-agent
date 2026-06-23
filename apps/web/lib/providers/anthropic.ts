import Anthropic from "@anthropic-ai/sdk";
import type { ChatProvider, ChatOptions } from "./types";

/** API key (string) or a subscription OAuth bearer token. */
export type AnthropicAuth = string | { authToken: string };

export function anthropicProvider(auth: AnthropicAuth, model = "claude-sonnet-4-6"): ChatProvider {
  const client =
    typeof auth === "string"
      ? new Anthropic({ apiKey: auth })
      : // OAuth (Claude Pro/Max): bearer token + the oauth beta flag, no x-api-key.
        new Anthropic({ authToken: auth.authToken, defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" } });
  return {
    id: "anthropic",
    model,
    async *chat({ system, messages }: ChatOptions) {
      const anthropicMessages: Anthropic.MessageParam[] = messages.map((message) => {
        if (!message.image || message.role !== "user") return { role: message.role, content: message.content };
        const match = message.image.dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s);
        if (!match) return { role: message.role, content: message.content };
        return {
          role: message.role,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: match[2]!,
              },
            },
            { type: "text", text: message.content || "Describe and help with this image." },
          ],
        };
      });
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system,
        messages: anthropicMessages,
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          yield ev.delta.text;
        }
      }
    },
  };
}
