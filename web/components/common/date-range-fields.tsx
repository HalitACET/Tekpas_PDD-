"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarDays, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Calendar } from "@/components/ui/calendar";

/** yyyy-mm-dd (the API's LocalDate) ↔ a local Date at midnight. */
function parseIso(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** gg.aa.yyyy in every language, as the design shows it. */
export function formatDay(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

const DAY = 86_400_000;

type Edge = "from" | "to";

interface DateRangeFieldsProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  labels: { from: string; to: string };
  errors?: { from?: string; to?: string };
}

/**
 * Two date fields that share one range calendar (design v0.3.1 24). The fields are triggers, not text
 * inputs: values are shown as gg.aa.yyyy and picked, never typed (no day/month mix-ups). Picking the start
 * moves the calendar on to the end; an end before the start becomes the new start.
 */
export function DateRangeFields({ from, to, onChange, labels, errors }: DateRangeFieldsProps) {
  const t = useTranslations("common.dateRange");
  const ids = { from: useId(), to: useId() };
  const fromRef = useRef<HTMLButtonElement>(null);
  const toRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<Edge | null>(null);
  const start = parseIso(from);
  const end = parseIso(to);
  const [month, setMonth] = useState<Date | undefined>(undefined);

  const open = (edge: Edge) => {
    setMonth((edge === "to" ? (end ?? start) : start) ?? new Date());
    setEditing((current) => (current === edge ? null : edge));
  };

  const pick = (day: Date) => {
    if (editing === "from") {
      onChange({ from: toIso(day), to: end && day > end ? "" : to });
      setEditing("to");
    } else if (start && day < start) {
      onChange({ from: toIso(day), to });
    } else {
      onChange({ from, to: toIso(day) });
      setEditing(null);
    }
  };

  const days = start && end ? Math.round((end.getTime() - start.getTime()) / DAY) + 1 : 0;
  const summary = days
    ? t("summary", { days, from: formatDay(start!), to: formatDay(end!) })
    : editing === "to"
      ? t("pickEnd")
      : t("pickStart");

  const field = (edge: Edge) => {
    const date = edge === "from" ? start : end;
    const error = errors?.[edge];
    const active = editing === edge;
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={ids[edge]} className="text-[13px] leading-[normal] font-medium">
          {labels[edge]}
        </label>
        <button
          ref={edge === "from" ? fromRef : toRef}
          id={ids[edge]}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={active}
          data-invalid={error ? "" : undefined}
          aria-describedby={error ? `${ids[edge]}-error` : undefined}
          onClick={() => open(edge)}
          className={`flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-2.5 text-left text-[13px] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft data-invalid:border-status-rejected ${
            active ? "border-ring ring-[3px] ring-ring-soft" : "border-input shadow-xs"
          } ${date ? "text-foreground" : "text-muted-foreground"}`}
        >
          <CalendarDays className="size-[15px] flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />
          {date ? formatDay(date) : t("format")}
        </button>
        {error && (
          <p id={`${ids[edge]}-error`} className="flex items-start gap-[5px] text-xs leading-[1.4] text-status-rejected-foreground">
            <CircleAlert className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      {field("from")}
      {field("to")}
      <Popover.Root
        open={editing !== null}
        onOpenChange={(next, details) => {
          if (next) return;
          // A press on the other field switches the edge (its own click handler) instead of closing.
          const target = details.event?.target;
          if (target instanceof Node && (fromRef.current?.contains(target) || toRef.current?.contains(target))) {
            return;
          }
          setEditing(null);
        }}
      >
        <Popover.Portal>
          <Popover.Positioner
            anchor={editing === "to" ? toRef : fromRef}
            side="bottom"
            align={editing === "to" ? "end" : "start"}
            sideOffset={8}
            className="isolate z-50"
          >
            <Popover.Popup
              aria-label={t("dialog")}
              initialFocus={false}
              className="flex w-[300px] flex-col gap-1.5 rounded-[10px] border bg-popover p-3 text-popover-foreground shadow-md outline-none transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0"
            >
              <Calendar
                month={month}
                onMonthChange={setMonth}
                onDayClick={pick}
                modifiers={{
                  endpoint: (day) => sameDay(day, start) || sameDay(day, end),
                  rangeStart: (day) => !!start && !!end && !sameDay(start, end) && sameDay(day, start),
                  rangeEnd: (day) => !!start && !!end && !sameDay(start, end) && sameDay(day, end),
                  rangeMiddle: (day) => !!start && !!end && day > start && day < end,
                }}
              />
              <div className="mt-0.5 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
                <span className="flex-1" aria-live="polite">
                  {summary}
                </span>
                <span className="font-mono text-[11px]">{t("format")}</span>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}

function sameDay(a: Date, b: Date | undefined): boolean {
  return !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
