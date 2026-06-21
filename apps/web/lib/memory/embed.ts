/**
 * Embeddings + sqlite-vec index/search.
 *
 * Embedder is pluggable (PRD open decision #6). The default `dummyEmbedder` is a
 * deterministic hashed bag-of-words — no network, no API key — so the whole loop
 * runs offline. Text sharing words lands near in cosine space, which is enough to
 * demonstrate recall plumbing. Swap in a provider/local model later via setEmbedder.
 */
import { getSqlite, getDb } from "../db/client";
import { vecMap } from "../db/schema";

export const EMBED_DIM = 384;

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export function dummyEmbedder(): Embedder {
  return {
    async embed(text: string): Promise<number[]> {
      const v = new Array<number>(EMBED_DIM).fill(0);
      for (const tok of text.toLowerCase().split(/\W+/).filter(Boolean)) {
        let h = 2166136261;
        for (let i = 0; i < tok.length; i += 1) {
          h ^= tok.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        const idx = Math.abs(h) % EMBED_DIM;
        v[idx] = (v[idx] ?? 0) + 1;
      }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    },
  };
}

let _embedder: Embedder = dummyEmbedder();
export function setEmbedder(e: Embedder): void {
  _embedder = e;
}
export function embedText(text: string): Promise<number[]> {
  return _embedder.embed(text);
}

export type RefType = "episodic" | "semantic" | "skill";

export async function embedAndIndex(refType: RefType, refId: string, text: string): Promise<void> {
  const sqlite = getSqlite();
  const vec = await embedText(text);
  // Replace any existing vector for this ref (idempotent re-ingest).
  const existing = sqlite
    .prepare("SELECT rowid FROM vec_map WHERE ref_type = ? AND ref_id = ?")
    .get(refType, refId) as { rowid: number } | undefined;
  if (existing) {
    sqlite.prepare("DELETE FROM vec_memory WHERE rowid = ?").run(existing.rowid);
    sqlite.prepare("DELETE FROM vec_map WHERE rowid = ?").run(existing.rowid);
  }
  const info = sqlite
    .prepare("INSERT INTO vec_memory(embedding) VALUES (vec_f32(?))")
    .run(JSON.stringify(vec));
  getDb().insert(vecMap).values({ rowid: Number(info.lastInsertRowid), refType, refId }).run();
}

export type SearchHit = { refType: RefType; refId: string; distance: number };

export async function semanticSearch(query: string, k = 8): Promise<SearchHit[]> {
  const sqlite = getSqlite();
  const qvec = await embedText(query);
  // sqlite-vec KNN requires a `k = ?` constraint (LIMIT alone isn't honored with a JOIN).
  const rows = sqlite
    .prepare(
      `SELECT m.ref_type AS refType, m.ref_id AS refId, v.distance AS distance
       FROM vec_memory v
       JOIN vec_map m ON m.rowid = v.rowid
       WHERE v.embedding MATCH vec_f32(?) AND k = ?
       ORDER BY v.distance`,
    )
    .all(JSON.stringify(qvec), k) as SearchHit[];
  return rows;
}
