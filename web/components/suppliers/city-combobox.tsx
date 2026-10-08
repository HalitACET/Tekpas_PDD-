"use client";

import { Combobox } from "@base-ui/react/combobox";
import { TR_PROVINCES } from "@tekpas/shared";
import { ChevronDown, Lock, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * City field of design v0.3 15: a select in the design; with 81 provinces it is searchable ("bur" → Burdur,
 * Bursa). Turkish case rules, so "is" finds İstanbul and "ığ" finds Iğdır.
 */
export function CityCombobox({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (city: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("suppliers.form");
  const [open, setOpen] = useState(false);
  const matches = (city: string, query: string) =>
    city.toLocaleLowerCase("tr").includes(query.trim().toLocaleLowerCase("tr"));

  return (
    <Combobox.Root
      items={TR_PROVINCES}
      value={value || null}
      onValueChange={(city: string | null) => onChange(city ?? "")}
      open={open}
      onOpenChange={setOpen}
      filter={matches}
      disabled={disabled}
      openOnInputClick
      autoHighlight
    >
      <Combobox.InputGroup
        aria-invalid={invalid || undefined}
        className={`relative flex h-9 items-center gap-2 rounded-md border border-input px-2.5 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring-soft aria-invalid:border-status-rejected aria-invalid:ring-[3px] aria-invalid:ring-status-rejected-muted data-popup-open:border-ring data-popup-open:ring-[3px] data-popup-open:ring-ring-soft ${
          disabled ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-card shadow-xs"
        }`}
      >
        {open && <Search className="size-[15px] flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />}
        <Combobox.Input
          id={id}
          aria-describedby={describedBy}
          placeholder={open ? t("citySearch") : t("cityPlaceholder")}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        {disabled ? (
          <Lock className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        ) : (
          <Combobox.Trigger
            aria-label={t("city")}
            className="flex size-6 cursor-pointer items-center justify-center text-muted-foreground outline-none"
          >
            <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden />
          </Combobox.Trigger>
        )}
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} className="isolate z-50 outline-none">
          <Combobox.Popup className="flex max-h-[min(280px,var(--available-height))] w-(--anchor-width) flex-col rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            <Combobox.Empty>
              <span className="block px-2 py-3 text-[13px] text-muted-foreground">{t("cityNone")}</span>
            </Combobox.Empty>
            <Combobox.List className="overflow-y-auto outline-none">
              {(city: string) => (
                <Combobox.Item
                  key={city}
                  value={city}
                  className="flex h-8 cursor-pointer items-center rounded-md px-2 text-[13px] outline-none select-none data-highlighted:bg-accent data-selected:font-medium"
                >
                  {city}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
