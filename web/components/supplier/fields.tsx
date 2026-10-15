"use client";

import { type ChemicalStandard } from "@tekpas/shared";
import { Check, ChevronDown, CircleAlert, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext, useId } from "react";
import { get, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { formatPercent } from "@/lib/format";
import { errorGroup, type SubmissionValues, SUPPLIER_ERROR_CODES, shareTotal } from "@/lib/supplier-request/form";
import { cn } from "@/lib/utils";

/*
 * The pieces of the supplier's form (design v0.4 40, 41, 45): 44 px controls, section cards with a mono number,
 * share rows with a total pill. Errors are codes (lib/supplier-request/form.ts), shown under the field.
 */

/** What the controls need to know about the form they sit in. */
interface FormInfo {
  /** API field names the manufacturer asked to correct (design 45). */
  flagged: ReadonlySet<string>;
}

const FormInfoContext = createContext<FormInfo>({ flagged: new Set() });
export const FormInfoProvider = FormInfoContext.Provider;
export const useFormInfo = () => useContext(FormInfoContext);

const CONTROL =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft aria-invalid:border-status-rejected aria-invalid:ring-[3px] aria-invalid:ring-status-rejected-muted data-[flagged=true]:border-status-rejected";

/** The message of an error code: the design's own for these, the API's field texts for the rest. */
export function useErrorText() {
  const tSupplier = useTranslations("supplier.errors");
  const tField = useTranslations("errors.field");
  return (code: string, params?: Record<string, string | number>) =>
    (SUPPLIER_ERROR_CODES as readonly string[]).includes(code)
      ? tSupplier(code as never)
      : tField(code as never, params as never);
}

/** The error of a form path, if there is one: its code. */
export function useFieldError(path: string): string | undefined {
  const { formState } = useFormContext<SubmissionValues>();
  const error = get(formState.errors, path) as { message?: string } | undefined;
  return error?.message;
}

export function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="flex items-start gap-1.5 text-[13px] font-normal text-status-rejected-foreground">
      <CircleAlert className="mt-0.5 size-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
      {children}
    </span>
  );
}

export interface ControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  "data-flagged": boolean;
}

/** Label, hint (or "İsteğe bağlı"), the control and its error: the shape of every field of the design. */
export function Field({
  label,
  hint,
  optional,
  error,
  flagged,
  className,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  /** The error's text. */
  error?: string;
  /** The manufacturer asked to correct this field. */
  flagged?: boolean;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const t = useTranslations("supplier.form");
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const note = [hint, optional ? t("optional") : undefined].filter(Boolean).join(" · ");
  const describedBy = [note ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex flex-col gap-1 text-sm font-medium">
        {label}
        {note && (
          <span id={hintId} className="text-[13px] font-normal text-muted-foreground">
            {note}
          </span>
        )}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy, "data-flagged": !!flagged })}
      {error && <ErrorLine id={errorId}>{error}</ErrorLine>}
    </div>
  );
}

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

/** A number with its unit at the right ("kg", "kWh/kg") or a mono prefix at the left ("Ne"). */
export function UnitInput({
  unit,
  prefix,
  mono,
  className,
  ...props
}: React.ComponentProps<"input"> & { unit?: string; prefix?: string; mono?: boolean }) {
  return (
    <span className="relative flex items-center">
      {prefix && <span className="pointer-events-none absolute left-3 font-mono text-[15px] text-muted-foreground">{prefix}</span>}
      <input
        className={cn(CONTROL, mono && "font-mono tabular-nums", unit && "pr-16", prefix && "pl-10", className)}
        inputMode={props.inputMode ?? "decimal"}
        {...props}
      />
      {unit && <span className="pointer-events-none absolute right-3 text-sm font-normal text-muted-foreground">{unit}</span>}
    </span>
  );
}

export function SelectInput({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative flex items-center">
      <select className={cn(CONTROL, "cursor-pointer appearance-none pr-[34px]", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

/** A numbered block of the form: border red when it has an error or the manufacturer asked for a correction. */
export function Section({
  id,
  number,
  title,
  sub,
  flagged,
  invalid,
  optional,
  children,
}: {
  id?: string;
  number: string;
  title: string;
  sub?: string;
  flagged?: boolean;
  invalid?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("supplier.form");
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4",
        flagged || invalid ? "border-status-rejected" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-medium text-muted-foreground">{number}</span>
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        {optional && <span className="text-[13px] text-muted-foreground">{t("optional")}</span>}
        {flagged && (
          <span className="inline-flex items-center rounded-sm bg-status-rejected-muted px-2 py-0.5 text-xs font-medium text-status-rejected-foreground">
            {t("fix.flag")}
          </span>
        )}
      </div>
      {sub && <p className="-mt-1.5 text-[13px] text-muted-foreground">{sub}</p>}
      {children}
    </section>
  );
}

/** "Toplam %100": green at 100, amber below or above; grey while nothing is typed. */
export function TotalPill({ total, idle }: { total: number; idle?: boolean }) {
  const t = useTranslations("supplier.form");
  const locale = useLocale();
  const tone = idle ? "pending" : total === 100 ? "approved" : "low-confidence";
  const tones = {
    pending: "bg-status-pending-muted text-status-pending-foreground [&>span:first-child]:bg-status-pending",
    approved: "bg-status-approved-muted text-status-approved-foreground [&>span:first-child]:bg-status-approved",
    "low-confidence":
      "bg-status-low-confidence-muted text-status-low-confidence-foreground [&>span:first-child]:bg-status-low-confidence",
  } as const;
  return (
    <span
      className={cn("ml-auto inline-flex items-center gap-1.5 rounded-full py-[5px] pr-2.5 pl-2 text-[13px] font-medium", tones[tone])}
    >
      <span className="size-1.5 rounded-full" aria-hidden />
      <span className="font-mono">{t("total", { value: formatPercent(total, locale) })}</span>
    </span>
  );
}

/**
 * Rows of "kind + whole percent" that add up to 100: the fibres of a yarn or fabric, the energy sources.
 * The total's error ("fibersGroup") reddens every percent field, as in design 40b.
 */
export function ShareRows({
  name,
  kind,
  options,
  optionLabel,
  kindLabel,
  addLabel,
  newRow,
  flagged,
  idleWhenEmpty,
}: {
  name: "fibers" | "energy";
  kind: "fiber" | "source";
  options: readonly string[];
  optionLabel: (option: string) => string;
  kindLabel: string;
  addLabel: string;
  newRow: string;
  flagged?: boolean;
  /** An optional mix that nobody started: the pill stays grey. */
  idleWhenEmpty?: boolean;
}) {
  const t = useTranslations("supplier.form");
  const tField = useErrorText();
  const { control, register } = useFormContext<SubmissionValues>();
  const { fields, append, remove } = useFieldArray({ control, name });
  const rows = useWatch({ control, name }) as { percent: string }[] | undefined;
  const group = useFieldError(`${name}Group`);
  const total = shareTotal(rows ?? []);
  const idle = idleWhenEmpty && (rows ?? []).every((r) => r.percent.trim() === "");
  const errorId = useId();
  const { formState } = useFormContext<SubmissionValues>();

  return (
    <div className="flex flex-col gap-3">
      {fields.map((row, i) => {
        const rowError = get(formState.errors, `${name}.${i}.percent`) as { message?: string } | undefined;
        const invalid = !!group || !!rowError;
        return (
          <div key={row.id} className="flex flex-col gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)_96px_44px] items-center gap-2">
              <SelectInput aria-label={kindLabel} {...register(`${name}.${i}.${kind}` as never)}>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {optionLabel(o)}
                  </option>
                ))}
              </SelectInput>
              <span className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 font-mono text-[15px] text-muted-foreground">%</span>
                <input
                  className={cn(CONTROL, "pr-3 pl-[30px] text-right font-mono")}
                  inputMode="numeric"
                  aria-label={t("percent")}
                  aria-invalid={invalid}
                  aria-describedby={group ? errorId : undefined}
                  data-flagged={!!flagged}
                  {...register(`${name}.${i}.percent` as never)}
                />
              </span>
              <button
                type="button"
                aria-label={t("remove")}
                disabled={fields.length === 1}
                onClick={() => remove(i)}
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            {rowError?.message && !group && <ErrorLine>{tField(rowError.message)}</ErrorLine>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => append({ [kind]: newRow, percent: "" } as never)}
          className="flex h-11 items-center gap-1.5 rounded-lg border border-dashed border-input px-3 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
        >
          <Plus className="size-4" strokeWidth={1.75} aria-hidden />
          {addLabel}
        </button>
        <TotalPill total={total} idle={idle} />
      </div>
      {group && <ErrorLine id={errorId}>{tField(group, { total })}</ErrorLine>}
    </div>
  );
}

/** Pills that toggle: "Kimyasal uyumu" (design 41). "Hiçbiri" excludes the others. */
export function ChemicalChips({
  options,
  optionLabel,
  value,
  onChange,
  error,
  flagged,
}: {
  options: readonly ChemicalStandard[];
  optionLabel: (option: ChemicalStandard) => string;
  value: ChemicalStandard[];
  onChange: (next: ChemicalStandard[]) => void;
  error?: string;
  flagged?: boolean;
}) {
  const t = useTranslations("supplier.form.sections.dye");
  const errorId = useId();
  const labelId = useId();
  const toggle = (option: ChemicalStandard) => {
    if (value.includes(option)) return onChange(value.filter((v) => v !== option));
    onChange(option === "NONE" ? ["NONE"] : [...value.filter((v) => v !== "NONE"), option]);
  };
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="flex flex-col gap-1 text-sm font-medium">
        {t("chemicals")}
        <span className="text-[13px] font-normal text-muted-foreground">{t("chemicalsHint")}</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((option, i) => {
          const on = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              data-invalid={!!error && i === 0}
              aria-describedby={error ? errorId : undefined}
              onClick={() => toggle(option)}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
                on
                  ? "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover"
                  : cn("border-input bg-card hover:bg-accent", (error || flagged) && "border-status-rejected"),
              )}
            >
              {on && <Check className="size-3.5" strokeWidth={2.4} aria-hidden />}
              {optionLabel(option)}
            </button>
          );
        })}
      </div>
      {error && <ErrorLine id={errorId}>{error}</ErrorLine>}
    </div>
  );
}

/** Two to four options side by side ("Eğirme"): optional, tapping the chosen one again clears it. */
export function Segmented<T extends string>({
  label,
  optional,
  options,
  optionLabel,
  value,
  onChange,
}: {
  label: string;
  optional?: boolean;
  options: readonly T[];
  optionLabel: (option: T) => string;
  value: T | "";
  onChange: (next: T | "") => void;
}) {
  const t = useTranslations("supplier.form");
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="flex flex-col gap-1 text-sm font-medium">
        {label}
        {optional && <span className="text-[13px] font-normal text-muted-foreground">{t("optional")}</span>}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex gap-0.5 rounded-[10px] bg-muted p-[3px]">
        {options.map((option) => {
          const on = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? "" : option)}
              className={cn(
                "h-11 min-w-0 flex-1 rounded-lg px-0.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
                on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {optionLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** How many separate fields (a section's rows count once) have errors: "4 alanda hata var". */
export function errorFieldCount(errors: Record<string, unknown>): number {
  return new Set(Object.keys(errors).map(errorGroup)).size;
}
