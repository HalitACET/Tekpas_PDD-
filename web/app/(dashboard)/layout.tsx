"use client";

import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/shell/app-shell";
import { useSession } from "@/lib/auth/use-session";

function Shell({ children }: { children: ReactNode }) {
  const session = useSession();
  // AuthGate renders children only once authenticated.
  if (session.status !== "authenticated") return null;
  return <AppShell user={session.user}>{children}</AppShell>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <Shell>{children}</Shell>
    </AuthGate>
  );
}
