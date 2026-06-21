/**
 * Skills registry (Fasa 5) — procedural memory layer of the Brain. Reusable
 * how-to that recall can surface across projects (PRD §2.1).
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../db/client";
import { skill } from "../db/schema";
import { embedAndIndex } from "../memory/embed";

export async function addSkill(input: {
  name: string;
  description: string;
  body: string;
  sourceProjects?: string[];
}): Promise<string> {
  const id = `skill-${randomUUID().slice(0, 8)}`;
  getDb()
    .insert(skill)
    .values({
      id,
      name: input.name,
      description: input.description,
      body: input.body,
      sourceProjects: input.sourceProjects ?? [],
      createdAt: Date.now(),
    })
    .run();
  await embedAndIndex("skill", id, `${input.name}\n${input.description}\n${input.body}`);
  return id;
}

export function listSkills(): Array<typeof skill.$inferSelect> {
  return getDb().select().from(skill).all();
}
