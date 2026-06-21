import type { ReactNode } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, ownerExists } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LoginLayout({ children }: { children: ReactNode }) {
  noStore();
  if (!ownerExists()) redirect("/setup");
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/assistant");
  return children;
}
