/** Provider-neutral chat interface. Adapters stream text deltas. */
export type Msg = { role: "user" | "assistant"; content: string };

export type ChatOptions = {
  system?: string;
  messages: Msg[];
};

export interface ChatProvider {
  id: string;
  model: string;
  chat(opts: ChatOptions): AsyncIterable<string>;
  embed?(text: string): Promise<number[]>;
}
