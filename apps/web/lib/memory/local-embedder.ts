/**
 * Local embedder — all-MiniLM-L6-v2 (384d) via transformers.js. No API key, runs
 * on CPU. Model weights download once (~25MB) then cache. Lazy-loaded so it costs
 * nothing until first use.
 */
import type { Embedder } from "./embed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _extractor: Promise<any> | null = null;

export function localEmbedder(model = "Xenova/all-MiniLM-L6-v2"): Embedder {
  return {
    async embed(text: string): Promise<number[]> {
      if (!_extractor) {
        _extractor = (async () => {
          const t = await import("@xenova/transformers");
          t.env.allowLocalModels = false;
          if (process.env.MOP_AGENT_MODEL_CACHE) {
            t.env.cacheDir = process.env.MOP_AGENT_MODEL_CACHE;
          }
          return t.pipeline("feature-extraction", model);
        })();
      }
      const extractor = await _extractor;
      const out = await extractor(text && text.trim() ? text : " ", { pooling: "mean", normalize: true });
      return Array.from(out.data as Float32Array);
    },
  };
}
