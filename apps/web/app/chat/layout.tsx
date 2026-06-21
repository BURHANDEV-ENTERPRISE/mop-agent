import type { ReactNode } from "react";
import { requirePageSession } from "@/lib/page-auth";

export default async function ChatLayout({ children }: { children: ReactNode }) {
  await requirePageSession();
  return children;
}
