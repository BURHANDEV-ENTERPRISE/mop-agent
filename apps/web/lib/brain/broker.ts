/**
 * Memory broker — federated recall with the judgment layer (PRD §2.3–2.4).
 *
 * Episodic memory is private to its project by default. Main Brain semantic notes
 * are always shareable. Cross-project episodic recall requires allowCrossProject
 * (TODO: gate on an explicit project link once links are modelled).
 */
import { inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { memoryEntry, semanticNote, skill } from "../db/schema";
import { semanticSearch } from "../memory/embed";

export type RecalledMemory = {
  id: string;
  projectId: string;
  kind: string;
  summary: string;
  body: string | null;
  at: number;
};

export class ContextPack {
  constructor(
    readonly episodic: RecalledMemory[],
    readonly semantic: Array<{ id: string; title: string; body: string }>,
    readonly procedural: Array<{ id: string; name: string; description: string }> = [],
  ) {}

  get isEmpty(): boolean {
    return this.episodic.length === 0 && this.semantic.length === 0 && this.procedural.length === 0;
  }

  toPromptString(): string {
    const lines: string[] = [];
    if (this.procedural.length) {
      lines.push("Reusable skills (procedural memory):");
      for (const s of this.procedural) lines.push(`- ${s.name}: ${s.description}`);
    }
    if (this.semantic.length) {
      lines.push("Cross-project knowledge (Main Brain):");
      for (const s of this.semantic) lines.push(`- ${s.title}: ${s.body}`);
    }
    if (this.episodic.length) {
      lines.push("Relevant project memory:");
      for (const m of this.episodic) {
        lines.push(`- [${m.kind}] ${m.summary}${m.body ? ` — ${m.body}` : ""}`);
      }
    }
    return lines.join("\n");
  }
}

export type RecallOptions = {
  query: string;
  projectId: string;
  allowCrossProject?: boolean;
  k?: number;
};

export async function recall(opts: RecallOptions): Promise<ContextPack> {
  const db = getDb();
  const hits = await semanticSearch(opts.query, opts.k ?? 16);

  const episodicIds = hits.filter((h) => h.refType === "episodic").map((h) => h.refId);
  const semanticIds = hits.filter((h) => h.refType === "semantic").map((h) => h.refId);
  const skillIds = hits.filter((h) => h.refType === "skill").map((h) => h.refId);

  // Episodic: load, then apply the judgment layer.
  const episodicRows = episodicIds.length
    ? db.select().from(memoryEntry).where(inArray(memoryEntry.id, episodicIds)).all()
    : [];
  const order = new Map(hits.map((h, i) => [h.refId, i]));
  const episodic: RecalledMemory[] = episodicRows
    .filter((m) => m.projectId === opts.projectId || opts.allowCrossProject === true)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((m) => ({
      id: m.id,
      projectId: m.projectId,
      kind: m.kind,
      summary: m.summary,
      body: m.body,
      at: m.at,
    }));

  // Semantic (Main Brain): always allowed.
  const semanticRows = semanticIds.length
    ? db.select().from(semanticNote).where(inArray(semanticNote.id, semanticIds)).all()
    : [];
  const semantic = semanticRows.map((s) => ({ id: s.id, title: s.title, body: s.body }));

  // Procedural (skills): always allowed (shared layer).
  const skillRows = skillIds.length
    ? db.select().from(skill).where(inArray(skill.id, skillIds)).all()
    : [];
  const procedural = skillRows.map((s) => ({ id: s.id, name: s.name, description: s.description }));

  return new ContextPack(episodic, semantic, procedural);
}
