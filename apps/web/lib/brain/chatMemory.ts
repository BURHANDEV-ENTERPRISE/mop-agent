/**
 * Persist mop-agent's own assistant chats as Main-Brain memory. Unlike mop-flow
 * memory (which is per-project), the central assistant IS the main system, so its
 * conversations live in Main Brain under a reserved "assistant" bucket. Project-
 * scoped chats are stored against their project instead.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../db/client";
import { memoryEntry } from "../db/schema";
import { embedAndIndex } from "../memory/embed";

/** Reserved projectId for central-assistant (no project) chat memory. */
export const ASSISTANT_PROJECT_ID = "__assistant__";
export const ASSISTANT_AGENT = "MOP-AGENT";

export async function saveChatMemory(opts: {
  projectId?: string;
  actor: string;
  userMessage: string;
  answer: string;
}): Promise<void> {
  const answer = opts.answer.trim();
  if (!answer) return;
  const id = `mem-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const summary = (opts.userMessage.replace(/\s+/g, " ").trim().slice(0, 80) || "conversation");
  getDb()
    .insert(memoryEntry)
    .values({
      id,
      projectId: opts.projectId || ASSISTANT_PROJECT_ID,
      kind: "conversation",
      summary,
      body: answer.slice(0, 4000),
      actor: opts.actor,
      agent: ASSISTANT_AGENT,
      agentRole: "assistant",
      at: Date.now(),
      private: true,
    })
    .run();
  await embedAndIndex("episodic", id, `${summary}\n${answer}`);
}
