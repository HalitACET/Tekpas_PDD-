"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BatchResponse } from "@/lib/api/batches";
import { BatchStatusChip } from "../batch-status-chip";

/**
 * The batch's stage with its passport (design v0.6): "Yayında · v2" while published, "Yayında v2" with "v3 taslağı
 * hazırlanıyor" while a new version is being prepared (the published one stays live), "Geri çekildi" after a withdrawal.
 * Every other stage is the batch's own chip.
 */
export function LifecycleChip({ batch, size = "default" }: { batch: BatchResponse; size?: "default" | "lg" }) {
  const t = useTranslations("publishing");
  const passport = batch.passport;
  const box = size === "lg" ? "h-6 text-[13px]" : "h-[22px] text-xs";

  if (passport?.withdrawn && batch.status !== "PUBLISHED") {
    return <Pill tone="rejected" label={t("chipWithdrawn")} box={box} />;
  }
  if (batch.status === "PUBLISHED" && passport) {
    return <Pill tone="brand" label={t("chipPublished", { version: passport.version })} box={box} />;
  }
  if (passport) {
    // Published once and being changed again: the live version and the draft next to it.
    return (
      <span className={`inline-flex items-center overflow-hidden rounded-[4px] border font-medium whitespace-nowrap ${box}`}>
        <span className="flex h-full items-center gap-1.5 bg-brand-muted px-2 text-brand-text">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          {t("chipDraft", { version: passport.version })}
        </span>
        <span className="flex h-full items-center gap-1.5 border-l bg-card px-2 text-muted-foreground">
          <Pencil className="size-3" strokeWidth={1.75} aria-hidden />
          {t("chipDraftNext", { next: passport.version + 1 })}
        </span>
      </span>
    );
  }
  return <BatchStatusChip status={batch.status} size={size} />;
}

const TONES = {
  brand: { chip: "bg-brand-muted text-brand-text", dot: "bg-brand" },
  rejected: { chip: "bg-status-rejected-muted text-status-rejected-foreground", dot: "bg-status-rejected" },
} as const;

function Pill({ tone, label, box }: { tone: keyof typeof TONES; label: string; box: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[4px] border border-transparent px-2 font-medium whitespace-nowrap ${box} ${TONES[tone].chip}`}>
      <span className={`size-1.5 rounded-full ${TONES[tone].dot}`} aria-hidden />
      {label}
    </span>
  );
}
