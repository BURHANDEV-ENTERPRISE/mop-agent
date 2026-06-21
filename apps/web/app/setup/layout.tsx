import type { ReactNode } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, ownerExists } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SetupLayout({ children }: { children: ReactNode }) {
  noStore();
  if (!ownerExists()) return children;
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? "/assistant" : "/login");
}
