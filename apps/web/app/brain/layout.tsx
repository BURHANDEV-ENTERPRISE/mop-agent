import type { ReactNode } from "react";
import { requirePageSession } from "@/lib/page-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BrainLayout({ children }: { children: ReactNode }) {
  await requirePageSession();
  return children;
}
