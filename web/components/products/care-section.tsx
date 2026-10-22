"use client";

import { CARE_CATEGORIES, CARE_NOTE_MAX, CARE_SYMBOLS_BY_CATEGORY, type CareCategory, type CareSymbol, gentlenessOptions } from "@tekpas/shared";
import { Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { CareSymbolIcon } from "@/components/care/care-symbol";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CareForm } from "@/lib/products/product-form";

/**
 * Design v1.0 120a–c: the product's care instructions. One symbol per group (a radio group of 44 px buttons;
 * choosing the selected one again or "Temizle" clears it), bars where the symbol takes them, a free note kept in
 * the language it is written in. A product with published batches says that they keep their instructions.
 */
export function CareSection({
  value,
  onChange,
  publishedBatchCount,
  noteError,
}: {
  value: CareForm;
  onChange: (value: CareForm) => void;
  publishedBatchCount: number;
  noteError?: string;
}) {
  const t = useTranslations("products.form.care");
  const tSymbol = useTranslations("enums.careSymbol");
  const tGentleness = useTranslations("enums.gentleness");
  const locale = useLocale();
  const ids = { title: useId(), note: useId(), noteHint: useId() };
  const empty = CARE_CATEGORIES.every((c) => value[c] === null) && value.note.trim() === "";

  const choose = (category: CareCategory, symbol: CareSymbol | null) =>
    onChange({ ...value, [category]: symbol === null ? null : { symbol, gentleness: "NORMAL" } });

  return (
    <section aria-labelledby={ids.title} className="flex flex-col gap-3.5 border-t pt-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={ids.title} className="m-0 text-sm font-semibold">
          {t("title")}
        </h3>
        <span className="text-xs text-muted-foreground">{t("hint")}</span>
      </div>

      {publishedBatchCount > 0 && (
        <div role="note" className="flex items-start gap-2 rounded-lg bg-status-submitted-muted px-3 py-2.5 text-xs leading-normal text-foreground">
          <Info className="mt-px size-[15px] flex-none text-status-submitted-foreground" strokeWidth={1.75} aria-hidden />
          <span>
            <strong className="font-semibold">{t("published", { count: publishedBatchCount })}</strong> {t("publishedBody")}
          </span>
        </div>
      )}

      {empty && (
        <div className="flex flex-col gap-0.5 rounded-lg border border-dashed border-input px-3.5 py-3">
          <span className="text-[13px] font-medium">{t("empty")}</span>
          <span className="text-xs text-muted-foreground">{t("emptyHint")}</span>
        </div>
      )}

      <div className="flex flex-col rounded-lg border">
        {CARE_CATEGORIES.map((category, i) => {
          const chosen = value[category];
          const bars = chosen ? gentlenessOptions(chosen.symbol) : [];
          const label = t(`categories.${category}`);
          return (
            <div
              key={category}
              role="radiogroup"
              aria-label={label}
              className={cn("grid grid-cols-[88px_minmax(0,1fr)] gap-3 p-3", i < CARE_CATEGORIES.length - 1 && "border-b")}
            >
              <div className="flex flex-col gap-1.5 pt-3">
                <span className="text-[13px] font-medium">{label}</span>
                {chosen && (
                  <button
                    type="button"
                    onClick={() => choose(category, null)}
                    className="self-start p-0 text-xs font-medium text-brand-text underline underline-offset-2"
                  >
                    {t("clear")}
                  </button>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {CARE_SYMBOLS_BY_CATEGORY[category].map((symbol) => {
                    const on = chosen?.symbol === symbol;
                    const name = tSymbol(symbol);
                    return (
                      <button
                        key={symbol}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={name}
                        title={name}
                        onClick={() => choose(category, on ? null : symbol)}
                        className={cn(
                          "flex size-11 items-center justify-center rounded-lg border p-0 hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring-soft focus-visible:outline-none",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground shadow-xs",
                        )}
                      >
                        <CareSymbolIcon symbol={symbol} gentleness={on ? chosen.gentleness : "NORMAL"} size={28} />
                      </button>
                    );
                  })}
                </div>
                {chosen && bars.length > 1 && (
                  <div className="flex gap-0.5 self-start rounded-lg bg-muted p-[3px]">
                    {bars.map((g) => {
                      const on = chosen.gentleness === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onChange({ ...value, [category]: { symbol: chosen.symbol, gentleness: g } })}
                          className={cn(
                            "h-7 rounded-md px-2.5 text-xs font-medium",
                            on ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
                          )}
                        >
                          {tGentleness(g)}
                        </button>
                      );
                    })}
                  </div>
                )}
                <span className={cn("text-[13px]", chosen ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {chosen
                    ? t("chosen", { name: tSymbol(chosen.symbol), gentleness: bars.length > 1 ? chosen.gentleness : "NORMAL" })
                    : t("none")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.note} className="text-[13px] font-medium">
          {t("note")}
        </label>
        <span id={ids.noteHint} className="-mt-1 text-xs text-muted-foreground">
          {t("noteHint")}
        </span>
        <Textarea
          id={ids.note}
          rows={2}
          maxLength={CARE_NOTE_MAX}
          placeholder={t("notePlaceholder")}
          aria-describedby={ids.noteHint}
          aria-invalid={noteError ? true : undefined}
          value={value.note}
          // The note is shown in the language it is written in: the panel's language while typing.
          onChange={(e) => onChange({ ...value, note: e.target.value.slice(0, CARE_NOTE_MAX), noteLanguage: locale })}
        />
        <span className="self-end font-mono text-[11px] text-muted-foreground">
          {t("noteCount", { count: value.note.length })}
        </span>
        {noteError && <span className="text-xs text-status-rejected-foreground">{noteError}</span>}
      </div>
    </section>
  );
}
