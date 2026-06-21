import { auth, ownerExists } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Server-side guard for authenticated application pages. */
export async function requirePageSession() {
  if (!ownerExists()) redirect("/setup");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/setup");
  return session;
}
