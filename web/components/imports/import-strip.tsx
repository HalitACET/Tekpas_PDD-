"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useImports } from "@/lib/api/imports";

/** How long an import counts as "just now" on the products page. */
const RECENT_MS = 30 * 60 * 1000;
const DISMISSED_KEY = "kozapass.importStrip.dismissed";

function dismissedId(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Design v1.1 157b: on the products page, after an import that created products, one line saying so with a link to its
 * result. Closing it hides it for that import (in this browser).
 */
export function ImportStrip() {
  const t = useTranslations("imports");
  const imports = useImports();
  const [dismissed, setDismissed] = useState(dismissedId);
  const [now] = useState(() => Date.now());

  const latest = imports.data?.[0];
  if (
    !latest ||
    latest.status !== "DONE" ||
    latest.createdRows === 0 ||
    !latest.finishedAt ||
    now - new Date(latest.finishedAt).getTime() > RECENT_MS ||
    dismissed === latest.id
  ) {
    return null;
  }
  const close = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, latest.id);
    } catch {
      // Private mode: it stays closed until the page is opened again.
    }
    setDismissed(latest.id);
  };
  const sub = [latest.failedRows > 0 ? t("failedRows", { count: latest.failedRows }) : undefined, latest.fileName].filter(Boolean).join(" · ");

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-status-approved bg-status-approved-muted py-2.5 pr-2.5 pl-4 text-[13px]">
      <Check className="size-4 flex-none text-status-approved-foreground" strokeWidth={2} aria-hidden />
      <strong className="font-medium">{t("strip", { count: latest.createdRows })}</strong>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{sub}</span>
      <Link href={`/imports?id=${latest.id}`} className="font-medium text-foreground underline underline-offset-[3px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft">
        {t("stripSeeResult")}
      </Link>
      <button
        type="button"
        aria-label={t("stripClose")}
        onClick={close}
        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring-soft"
      >
        <X className="size-4" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
