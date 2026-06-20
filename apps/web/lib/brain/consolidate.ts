/**
 * Consolidation engine (Fasa 4, manual trigger) — episodic → semantic.
 *
 * Promotes patterns that RECUR across memories/projects into the Main Brain, the
 * way human memory consolidates experience into general knowledge (PRD §2.2).
 * Respects the judgment layer (§2.4): only generalized, anonymized patterns are
 * promoted — raw project ids never go into the semantic body.
 *
 * Pattern extraction is pluggable. The default is deterministic (no LLM) so this
 * runs offline; pass an LLM-backed extractor for richer synthesis.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../db/client";
import { memoryEntry, semanticNote } from "../db/schema";
import { embedAndIndex } from "../memory/embed";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "when", "every",
  "use", "uses", "used", "are", "was", "were", "will", "your", "you", "via",
  "should", "must", "have", "has", "had", "not", "but", "its", "their", "them",
]);

export type ClusterMember = { id: string; projectId: string; summary: string; body: string | null };

export type Pattern = { title: string; body: string; confidence: number };

export type PatternExtractor = (members: ClusterMember[], keyword: string) => Promise<Pattern>;

/** Deterministic, offline default: generalize the recurring members. */
export const deterministicExtractor: PatternExtractor = async (members, keyword) => {
  const projects = new Set(members.map((m) => m.projectId));
  const uniqueSummaries = [...new Set(members.map((m) => m.summary.trim()))];
  const confidence = Math.min(95, 40 + members.length * 10 + projects.size * 10);
  const body =
    `Recurring across ${members.length} memories in ${projects.size} project(s). ` +
    `Common theme: "${keyword}". Examples: ` +
    uniqueSummaries.slice(0, 4).map((s) => `“${s}”`).join("; ") +
    ".";
  return { title: `Pattern: ${keyword}`, body, confidence };
};

function keywordsOf(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  ];
}

export type ConsolidateOptions = {
  sinceDays?: number;
  minClusterSize?: number;
  maxNotes?: number;
  extractor?: PatternExtractor;
};

export type ConsolidateResult = {
  scanned: number;
  clusters: number;
  notesCreated: number;
  notes: Array<{ id: string; title: string; sourceProjects: string[]; confidence: number }>;
};

export async function consolidate(opts: ConsolidateOptions = {}): Promise<ConsolidateResult> {
  const db = getDb();
  const minSize = opts.minClusterSize ?? 2;
  const maxNotes = opts.maxNotes ?? 5;
  const extract = opts.extractor ?? deterministicExtractor;

  const since = opts.sinceDays ? Date.now() - opts.sinceDays * 86_400_000 : 0;
  const rows = db.select().from(memoryEntry).all().filter((r) => r.at >= since);

  // doc-frequency of each keyword + which projects it spans
  const byKeyword = new Map<string, ClusterMember[]>();
  for (const r of rows) {
    const member: ClusterMember = { id: r.id, projectId: r.projectId, summary: r.summary, body: r.body };
    for (const kw of keywordsOf(`${r.summary} ${r.body ?? ""}`)) {
      const arr = byKeyword.get(kw) ?? [];
      arr.push(member);
      byKeyword.set(kw, arr);
    }
  }

  // Rank candidate clusters: prefer cross-project, then size.
  const candidates = [...byKeyword.entries()]
    .map(([kw, members]) => {
      const dedup = [...new Map(members.map((m) => [m.id, m])).values()];
      const projectSpan = new Set(dedup.map((m) => m.projectId)).size;
      return { kw, members: dedup, projectSpan };
    })
    .filter((c) => c.members.length >= minSize)
    .sort((a, b) => b.projectSpan - a.projectSpan || b.members.length - a.members.length);

  const usedMemoryIds = new Set<string>();
  const notes: ConsolidateResult["notes"] = [];
  let clusters = 0;

  for (const c of candidates) {
    if (notes.length >= maxNotes) break;
    // Skip near-duplicate clusters already mostly covered.
    const fresh = c.members.filter((m) => !usedMemoryIds.has(m.id));
    if (fresh.length < minSize) continue;
    clusters += 1;

    const pattern = await extract(c.members, c.kw);
    const id = `sem-${randomUUID().slice(0, 8)}`;
    const sourceProjects = [...new Set(c.members.map((m) => m.projectId))];

    db.insert(semanticNote)
      .values({
        id,
        title: pattern.title,
        body: pattern.body,
        sourceProjects,
        confidence: pattern.confidence,
        createdAt: Date.now(),
      })
      .run();
    await embedAndIndex("semantic", id, `${pattern.title}\n${pattern.body}`);

    for (const m of c.members) usedMemoryIds.add(m.id);
    notes.push({ id, title: pattern.title, sourceProjects, confidence: pattern.confidence });
  }

  return { scanned: rows.length, clusters, notesCreated: notes.length, notes };
}

export function listSemanticNotes(): Array<typeof semanticNote.$inferSelect> {
  return getDb().select().from(semanticNote).all();
}
