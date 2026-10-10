"use client";

import { useTranslations } from "next-intl";
import { useTasks } from "@/lib/api/tasks";
import { useSession } from "@/lib/auth/use-session";

/** The menu's task count (design v0.4 48a, "Görevler 7"); hidden at 0 and while unknown. */
export function TasksBadge({ className = "" }: { className?: string }) {
  const t = useTranslations("nav");
  const session = useSession();
  // Supplier users have no company tasks (GET /tasks is 403 for them).
  const tasks = useTasks({ enabled: session.status === "authenticated" && session.user.role !== "SUPPLIER" });
  const total = tasks.data?.total ?? 0;
  if (total === 0) return null;
  return (
    <span
      className={`ml-auto flex h-[18px] min-w-5 items-center justify-center rounded-full bg-brand px-1.5 font-mono text-[11px] font-semibold text-brand-foreground ${className}`}
    >
      <span aria-hidden>{total}</span>
      <span className="sr-only">{t("tasksCount", { count: total })}</span>
    </span>
  );
}
