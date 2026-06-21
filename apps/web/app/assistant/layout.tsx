import type { ReactNode } from "react";
import { requirePageSession } from "@/lib/page-auth";

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  await requirePageSession();
  return children;
}
