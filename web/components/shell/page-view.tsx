"use client";

import { Plus, Search, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { PAGES_WITH_IMPORT, PAGES_WITHOUT_ACTIONS, type PageKey } from "@/lib/nav";

/** Column template of the design G table header. */
const TABLE_COLUMNS = "grid-cols-[40px_170px_minmax(0,1.6fr)_160px_150px_120px]";

interface GuideStep {
  title: string;
  body: string;
}

/**
 * Design G page: title, actions, (inactive) filters, table frame with the empty state. Real lists come
 * with their milestones; until then every action shows a "coming soon" toast.
 */
export function PageView({ page }: { page: PageKey }) {
  const t = useTranslations(`pages.${page}`);
  const tPage = useTranslations("page");
  const tCommon = useTranslations("common");
  const hasActions = !PAGES_WITHOUT_ACTIONS.includes(page);
  const columns = t.raw("cols") as string[];
  const guide = page === "batches" ? (t.raw("guide.steps") as GuideStep[]) : undefined;

  const comingSoon = () =>
    toast(tCommon("comingSoon.title"), { description: tCommon("comingSoon.description") });

  return (
    <>
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-[-0.015em]">{t("title")}</h1>
          <p className="text-[13px] leading-[normal] text-muted-foreground">{t("sub")}</p>
        </div>
        {hasActions && (
          <div className="ml-auto flex gap-3">
            {PAGES_WITH_IMPORT.includes(page) && (
              <Button variant="secondary" onClick={comingSoon}>
                <Upload strokeWidth={1.75} aria-hidden />
                {tPage("import")}
              </Button>
            )}
            <Button onClick={comingSoon}>
              <Plus strokeWidth={1.75} aria-hidden />
              {t("cta")}
            </Button>
          </div>
        )}
      </div>

      {/* Filters are not built yet: shown dimmed and inert, as in the design. */}
      <div className="flex gap-2 opacity-55" aria-hidden inert>
        <div className="flex h-8 w-[280px] items-center gap-2 rounded-md border border-input px-2.5 text-[13px] text-muted-foreground">
          <Search className="size-3.5" strokeWidth={1.75} />
          {tPage("filter")}
        </div>
        {[tPage("status"), tPage("supplier")].map((label) => (
          <div
            key={label}
            className="flex h-8 items-center gap-1.5 rounded-md border border-dashed border-input px-2.5 text-[13px] text-muted-foreground"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            {label}
          </div>
        ))}
      </div>

      <section
        aria-labelledby={`${page}-empty-title`}
        className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-lg border bg-card"
      >
        <div
          className={`grid h-9 shrink-0 items-center border-b bg-muted px-1 text-xs font-medium text-muted-foreground ${TABLE_COLUMNS}`}
          aria-hidden
        >
          <span />
          {columns.map((column, i) => (
            <span key={i}>{column}</span>
          ))}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-[14px] bg-muted">
            <LogoMark size={30} variant="simplified" color="var(--muted-foreground)" cutout="var(--muted)" />
          </span>
          <h2 id={`${page}-empty-title`} className="font-serif text-[26px] leading-[normal] font-normal tracking-[-0.015em]">
            {t("emptyTitle")}
          </h2>
          <p className="max-w-[420px] text-sm leading-[1.55] text-pretty text-muted-foreground">{t("emptyBody")}</p>
          {hasActions && (
            <div className="mt-1.5 flex gap-2">
              <Button onClick={comingSoon}>{t("cta")}</Button>
              <Button variant="secondary" onClick={comingSoon}>
                {t("cta2")}
              </Button>
            </div>
          )}
          {guide && (
            <ol
              aria-label={t("guide.label")}
              className="mt-7 flex flex-wrap justify-center gap-7 border-t pt-5 text-left text-[13px]"
            >
              {guide.map((step, i) => (
                <li key={step.title} className="flex items-center gap-2.5">
                  <span
                    className="flex size-[22px] items-center justify-center rounded-full border border-input font-mono text-[11px] font-medium text-muted-foreground"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="flex flex-col leading-[normal]">
                    <span className="font-medium">{step.title}</span>
                    <span className="text-xs leading-[normal] text-muted-foreground">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
