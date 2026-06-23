import { redirect } from "next/navigation";

/**
 * /brain now opens the knowledge graph directly — the old dashboard landing was
 * folded into the graph view (Main Brain tab carries the stats + consolidate).
 */
export default function BrainPage() {
  redirect("/brain/graph");
}
