import type { ReactNode } from "react";
import { requireOwnerPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamLayout({ children }: { children: ReactNode }) {
  await requireOwnerPage();
  return children;
}
