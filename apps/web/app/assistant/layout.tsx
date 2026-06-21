import type { ReactNode } from "react";
import { getRole } from "@/lib/auth";
import { requirePageSession } from "@/lib/page-auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession();
  return (
    <AppShell viewer={{
      name: session.user.name || session.user.email,
      email: session.user.email,
      role: getRole(session.user.id) ?? "member",
    }}>
      {children}
    </AppShell>
  );
}
