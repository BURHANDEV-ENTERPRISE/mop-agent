import OpenAI from "openai";
import type { ChatOptions, ChatProvider } from "./types";

/**
 * One adapter for every OpenAI-compatible provider (OpenAI, Gemini's OpenAI
 * endpoint, DeepSeek, GLM, Groq, Mistral, xAI, Moonshot, OpenRouter, custom
 * proxies/Ollama…). Differs only by base URL + key + model.
 */
export function openAICompatProvider(opts: {
  id: string;
  apiKey: string;
  baseURL: string;
  model: string;
}): ChatProvider {
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  return {
    id: opts.id,
    model: opts.model,
    async *chat({ system, messages }: ChatOptions) {
      const mapped: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map((message) => {
        if (!message.image || message.role !== "user") return { role: message.role, content: message.content };
        return {
          role: "user",
          content: [
            { type: "text", text: message.content || "Describe and help with this image." },
            { type: "image_url", image_url: { url: message.image.dataUrl } },
          ],
        };
      });
      const stream = await client.chat.completions.create({
        model: opts.model,
        stream: true,
        messages: [
          ...(system ? ([{ role: "system" as const, content: system }]) : []),
          ...mapped,
        ],
      });
      for await (const chunk of stream) {
        yield chunk.choices[0]?.delta?.content ?? "";
      }
    },
  };
}
