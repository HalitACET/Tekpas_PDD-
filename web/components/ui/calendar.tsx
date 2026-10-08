"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import type { ComponentProps } from "react";
import { DayPicker } from "react-day-picker";
import { de, enUS, tr } from "react-day-picker/locale";
import { cn } from "@/lib/utils";

/*
 * Design v0.3.1 24 calendar (react-day-picker): weeks start on Monday, 28 px bordered month buttons around
 * the caption, 36 px rows. Days are styled through the modifiers rangeStart / rangeEnd / rangeMiddle /
 * endpoint, so a caller decides what a click means (the range field below switches start → end).
 */
export function Calendar({ className, classNames, modifiersClassNames, ...props }: ComponentProps<typeof DayPicker>) {
  const locale = useLocale();
  // Accessible day and navigation labels ("Bugün, 3 Ekim 2026 Cumartesi", "Önceki aya git").
  const dayPickerLocale = locale === "tr" ? tr : locale === "de" ? de : enUS;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const caption = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  return (
    <DayPicker
      locale={dayPickerLocale}
      weekStartsOn={1}
      showOutsideDays
      fixedWeeks={false}
      navLayout="around"
      formatters={{
        formatWeekdayName: (date) => weekday.format(date).replace(".", ""),
        formatCaption: (date) => caption.format(date),
      }}
      className={cn("text-[13px]", className)}
      classNames={{
        months: "relative",
        month: "grid grid-cols-[28px_1fr_28px] items-center gap-x-1 gap-y-1.5",
        month_caption: "col-start-2 row-start-1 flex h-7 items-center justify-center",
        caption_label: "text-[13px] font-semibold first-letter:uppercase",
        button_previous:
          "col-start-1 row-start-1 flex size-7 cursor-pointer items-center justify-center rounded-md border border-input text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft",
        button_next:
          "col-start-3 row-start-1 flex size-7 cursor-pointer items-center justify-center rounded-md border border-input text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft",
        month_grid: "col-span-3 mt-1 w-full border-collapse",
        weekdays: "h-6",
        weekday: "text-[11px] font-medium text-muted-foreground",
        week: "",
        day: "h-9 p-0 py-px text-center",
        day_button:
          "mx-auto flex size-[34px] cursor-pointer items-center justify-center rounded-md tabular-nums outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft",
        outside: "text-muted-foreground",
        today: "[&>button]:shadow-[inset_0_0_0_1px_var(--input)]",
        ...classNames,
      }}
      modifiersClassNames={{
        rangeMiddle: "bg-popover-muted",
        rangeStart: "rounded-l-md bg-popover-muted",
        rangeEnd: "rounded-r-md bg-popover-muted",
        endpoint:
          "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:shadow-none [&>button]:hover:bg-primary-hover",
        ...modifiersClassNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" strokeWidth={1.75} aria-hidden />
          ),
      }}
      {...props}
    />
  );
}
