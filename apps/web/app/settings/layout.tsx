import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireOwnerPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await requireOwnerPage();
  return (
    <AppShell viewer={{
      name: session.user.name || session.user.email,
      email: session.user.email,
      role: "owner",
    }}>
      {children}
    </AppShell>
  );
}
