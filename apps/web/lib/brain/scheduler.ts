/**
 * Background scheduler (Fasa 3.5/5). Cron-driven jobs — currently scheduled
 * consolidation (episodic → semantic) so the Brain grows automatically.
 * Set MOP_AGENT_CONSOLIDATE_CRON (e.g. "0 3 * * *") to enable; off if unset.
 */
import { Cron } from "croner";
import { consolidate } from "./consolidate";

const g = globalThis as unknown as { __mopJobs?: Cron[] };

export function startScheduler(): string[] {
  g.__mopJobs ??= [];
  const started: string[] = [];

  const expr = process.env.MOP_AGENT_CONSOLIDATE_CRON;
  if (expr) {
    const job = new Cron(expr, async () => {
      try {
        const r = await consolidate();
        console.log(`[cron] consolidate → ${r.notesCreated} pattern(s) from ${r.scanned} memories`);
      } catch (e) {
        console.error("[cron] consolidate failed:", e);
      }
    });
    g.__mopJobs.push(job);
    started.push(`consolidate@${expr}`);
  }

  return started;
}
