"use client";

import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";

/**
 * Signed-in pages that take the whole window, without the menu and the top bar: the passport preview with its
 * translations (design v1.1 140) brings its own bar.
 */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
