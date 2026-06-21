import { auth, getRole, ownerExists } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

/** Server-side guard for authenticated application pages. */
export async function requirePageSession() {
  // Auth redirects are cookie-specific and must never enter Next's route cache.
  noStore();
  if (!ownerExists()) redirect("/setup");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/setup");
  return session;
}

/** Server-side guard for pages that expose installation-wide administration. */
export async function requireOwnerPage() {
  const session = await requirePageSession();
  if (getRole(session.user.id) !== "owner") redirect("/assistant");
  return session;
}
