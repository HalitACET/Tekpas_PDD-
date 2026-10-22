"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ImportResponse, ImportRowError } from "@/lib/api/imports";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The most errors the server keeps; the counts above the table are always complete. */
const MAX_LISTED = 200;
const GRID = "grid grid-cols-[72px_150px_230px_minmax(0,1fr)] gap-4";

const FIBER = /^fiber\d$/;
const PERCENT = /^percent\d$/;

/** "fiber2" → its number, "percent3" → 3. */
function numberOf(column: string): number {
  return Number(column.replace(/\D/g, ""));
}

/** The issue's message key: the API's code, said more exactly where the column tells more. */
function issueKey(e: ImportRowError): string {
  if (e.code === "NotBlank" && e.column === "name") return "NameNotBlank";
  if (e.code === "NotNull" && FIBER.test(e.column)) return "FiberMissing";
  if (e.code === "GtinFormat") return "Gtin";
  if (e.code === "Min" || e.code === "Max") return "Range";
  return e.code;
}

/**
 * "Hatalı satırlar" (design v1.1 153a/b): row, column (as the template names it), value and what is wrong, with a hint
 * to fix it where one helps. A row's further errors leave the row number out. At most 200 errors are kept; the rows
 * beyond them are counted at the end.
 */
export function ErrorTable({ job }: { job: ImportResponse }) {
  const t = useTranslations("imports");
  const locale = useLocale();
  const listedRows = new Set(job.errors.map((e) => e.row)).size;
  const more = job.failedRows - listedRows;

  const columnName = (column: string) =>
    FIBER.test(column)
      ? t("column.fiber", { n: numberOf(column) })
      : PERCENT.test(column)
        ? t("column.percent", { n: numberOf(column) })
        : t.has(`column.${column}`)
          ? t(`column.${column}` as never)
          : column;
  const issue = (e: ImportRowError) => {
    const key = issueKey(e);
    return t.has(`issue.${key}`) ? t(`issue.${key}` as never) : t("issue.other");
  };
  const percent = (value: string) => formatPercent(Number(value), locale);
  const hint = (e: ImportRowError): string | undefined => {
    const key = issueKey(e);
    if (key === "UnknownValue") return t("hint.UnknownValue");
    if (!e.detail) return undefined;
    switch (key) {
      case "GtinCheckDigit":
        return t("hint.GtinCheckDigit", { digit: e.detail });
      case "FiberTotal":
        return t("hint.FiberTotal", { total: percent(e.detail) });
      case "FiberMissing":
        return t("hint.FiberMissing", { column: t("column.percent", { n: numberOf(e.column) }), value: e.detail });
      case "Duplicate":
        return t("hint.Duplicate", { row: e.detail });
      case "Unique":
        return t("hint.Unique", { name: e.detail });
      default:
        return undefined;
    }
  };
  // A composition's value is its percentages ("60 + 30"), written as the page writes percentages.
  const value = (e: ImportRowError) => (e.column === "fibers" && e.value ? e.value.split(" + ").map(percent).join(" + ") : e.value);

  return (
    <div className="overflow-hidden rounded-[10px] border bg-card">
      <div className="flex flex-wrap items-baseline gap-2.5 border-b px-4 py-3">
        <h2 id="h-errors" className="text-[15px] font-semibold">
          {t("errorsTitle")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {job.errors.length >= MAX_LISTED ? t("errorsSubMax", { count: MAX_LISTED }) : t("errorsSub", { count: job.errors.length })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div role="table" aria-labelledby="h-errors" className="min-w-[700px]">
          <div role="row" className={cn(GRID, "border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground")}>
            <span role="columnheader">{t("colRow")}</span>
            <span role="columnheader">{t("colColumn")}</span>
            <span role="columnheader">{t("colValue")}</span>
            <span role="columnheader">{t("colIssue")}</span>
          </div>
          <div role="rowgroup" className={cn(job.errors.length >= MAX_LISTED && "max-h-[330px] overflow-y-auto")}>
            {job.errors.map((e, i) => {
              const sameRow = i > 0 && job.errors[i - 1].row === e.row;
              const shown = value(e);
              const help = hint(e);
              return (
                <div
                  key={i}
                  role="row"
                  className={cn(GRID, "items-baseline px-4 py-[9px] text-[13px]", i > 0 && (sameRow ? "border-t border-transparent" : "border-t"))}
                >
                  <span role="cell" className={cn("font-mono font-medium tabular-nums", sameRow && "text-transparent")}>
                    {e.row}
                  </span>
                  <span role="cell">{columnName(e.column)}</span>
                  <span
                    role="cell"
                    title={shown ?? undefined}
                    className={cn("truncate", shown ? "font-mono" : "text-muted-foreground italic")}
                  >
                    {shown || t("empty")}
                  </span>
                  <span role="cell" className="flex min-w-0 flex-wrap items-baseline gap-2">
                    <span className="font-medium text-status-rejected-foreground">{issue(e)}</span>
                    {help && <span className="text-xs text-muted-foreground">{help}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {more > 0 && (
        <div className="border-t bg-muted px-4 py-2.5 text-[13px] text-muted-foreground">
          <strong className="font-semibold text-foreground">{t("moreRows", { count: more })}</strong> {t("moreRowsBody")}
        </div>
      )}
    </div>
  );
}
