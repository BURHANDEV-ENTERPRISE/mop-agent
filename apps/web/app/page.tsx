import { requirePageSession } from "@/lib/page-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Product entry point. First-run and signed-out users belong in the account
 * setup flow; authenticated users land in the assistant, not the Brain tools.
 */
export default async function Home() {
  await requirePageSession();
  redirect("/assistant");
}
