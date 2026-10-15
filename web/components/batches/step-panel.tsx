"use client";

import { CORRECTION_PRESETS, FIBERS, type Fiber, ORIGIN_COUNTRIES, type StepType } from "@tekpas/shared";
import { Check, CheckCircle2, CircleAlert, Inbox, Link2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { GuardedButton } from "@/components/common/guarded-button";
import { NativeSelect } from "@/components/common/native-select";
import { StepStatusBadge } from "@/components/common/step-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetBody, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { type ChainStep, type StepData, useApproveStep, useRejectStep, useSaveOrigin } from "@/lib/api/batches";
import { ApiError } from "@/lib/api/request";
import { DRAWN_STEP_TYPES } from "@/lib/batches/chain-layout";
import { stepDataRows } from "@/lib/batches/step-data";
import { RequestDialog } from "./request-dialog";

/** The batch the panel belongs to (the request dialog's text, the published lock of the fibre origin). */
export interface PanelBatch {
  id: string;
  batchNo: string;
  productName: string;
  published: boolean;
}

export function StepLine({ type }: { type: StepType }) {
  const t = useTranslations("batches.chain.panel");
  const tStep = useTranslations("enums.stepType");
  return (
    <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
      {t("stepLine", {
        step: tStep(type),
        n: DRAWN_STEP_TYPES.indexOf(type as (typeof DRAWN_STEP_TYPES)[number]) + 1,
        total: DRAWN_STEP_TYPES.length,
      })}
    </span>
  );
}

/** "Selin A." (design v0.4 47a): first name and the initial of the last. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts.slice(0, -1).join(" ")} ${parts.at(-1)![0]}.` : name.trim();
}

function useDateTime() {
  const locale = useLocale();
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (iso: string) => format.format(new Date(iso));
}

/**
 * Design v0.4 47a/b (v0.3 10 for a step without data): the supplier's data, the review of a submission and the
 * correction request. The documents' fields (M5) and the comparisons with the label and earlier batches (M7)
 * stay out. FIBER is the manufacturer's own declaration: its origin is entered here.
 */
export function StepPanel({
  batch,
  step,
  reviewer,
  canWrite,
  requestOnOpen = false,
}: {
  batch: PanelBatch;
  step: ChainStep;
  /** OWNER and ADMIN approve and reject. */
  reviewer: boolean;
  /** OWNER, ADMIN and EDITOR send links and enter the origin. */
  canWrite: boolean;
  /** Open "Veri talep et" at once (from the tasks page). */
  requestOnOpen?: boolean;
}) {
  const t = useTranslations("batches.chain.panel");
  const tChain = useTranslations("batches.chain");
  const tFiber = useTranslations("enums.fiber");
  const dateTime = useDateTime();
  const fiber = step.stepType === "FIBER";
  const name = step.supplier?.name ?? (step.data.fiberType ? tFiber(step.data.fiberType) : tChain("originMissing"));
  const city = step.supplier ? step.supplier.city : step.data.originRegion;
  const [requesting, setRequesting] = useState(requestOnOpen);
  const [fixing, setFixing] = useState(false);
  const [fixSent, setFixSent] = useState(false);
  const approve = useApproveStep(batch.id);

  const canRequest = !!step.supplier && (step.status === "PENDING" || step.status === "REJECTED");
  const submitted = step.status === "SUBMITTED";
  const who = step.submission ? `${shortName(step.submission.name)} · ${dateTime(step.submission.at)}` : step.submittedAt ? dateTime(step.submittedAt) : undefined;

  return (
    <>
      <SheetHeader className="gap-1.5 pt-[18px]">
        <StepLine type={step.stepType} />
        <SheetTitle>{name}</SheetTitle>
        <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
          {city}
          <StepStatusBadge status={step.status} />
        </div>
      </SheetHeader>
      {fiber ? (
        <OriginPanel batch={batch} step={step} canWrite={canWrite} />
      ) : (
        <>
          <SheetBody className="gap-[22px]">
            {submitted && who && (
              <div className="flex items-start gap-2.5 rounded-lg bg-status-submitted-muted px-3.5 py-3 text-[13px] leading-[1.45] text-status-submitted-foreground">
                <Inbox className="mt-px size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{t("review.title")}</span>
                  <span>{t("review.body", { who })}</span>
                </span>
              </div>
            )}
            {step.status === "REJECTED" && step.rejection && !fixSent && <RejectionBox step={step} />}
            <StepData step={step} who={who} />
            {fixing && (
              <FixSection
                batchId={batch.id}
                step={step}
                onCancel={() => setFixing(false)}
                onSent={() => {
                  setFixing(false);
                  setFixSent(true);
                }}
              />
            )}
            {fixSent && (
              <div role="status" className="flex gap-2.5 rounded-lg bg-status-submitted-muted p-3 text-[13px] leading-[1.45] text-status-submitted-foreground">
                <CheckCircle2 className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="flex flex-col items-start gap-2.5">
                  <span>{t("fix.sent")}</span>
                  {canRequest && canWrite && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setRequesting(true)}>
                      <Link2 className="size-3.5" strokeWidth={1.75} aria-hidden />
                      {t("fix.newLink")}
                    </Button>
                  )}
                </span>
              </div>
            )}
          </SheetBody>
          <SheetFooter>
            <GuardedButton
              allowed={canWrite}
              tooltipSide="top"
              tooltipAlign="start"
              variant="secondary"
              className="px-3"
              disabled={!canRequest}
              onClick={() => setRequesting(true)}
            >
              <Link2 className="size-3.5" strokeWidth={1.75} aria-hidden />
              {t("requestData")}
            </GuardedButton>
            <GuardedButton
              allowed={reviewer}
              tooltipSide="top"
              tooltipAlign="start"
              variant="secondary"
              className={`px-3 ${fixing ? "bg-accent" : ""}`}
              disabled={!submitted || fixing}
              onClick={() => setFixing(true)}
            >
              {t("requestFix")}
            </GuardedButton>
            <span className="ml-auto flex">
              <GuardedButton
                allowed={reviewer}
                tooltipSide="top"
                className="px-4"
                disabled={!submitted || approve.isPending}
                onClick={() =>
                  approve.mutate(step.id, {
                    onError: (error) => showErrorToast({ title: t("approveFailed"), error }),
                  })
                }
              >
                <Check className="size-3.5" strokeWidth={2} aria-hidden />
                {t("approve")}
              </GuardedButton>
            </span>
          </SheetFooter>
          {step.supplier && (
            <RequestDialog
              open={requesting && canRequest}
              onClose={() => setRequesting(false)}
              batchId={batch.id}
              batchNo={batch.batchNo}
              productName={batch.productName}
              step={step}
            />
          )}
        </>
      )}
    </>
  );
}

/** "Tedarikçinin girdiği veriler" (47a), all fields of the step type with "—" for the missing ones. */
function StepData({ step, who }: { step: ChainStep; who?: string }) {
  const t = useTranslations("batches.chain.panel");
  const rows = useRows(step);
  const marked = new Set(step.status === "REJECTED" ? (step.rejection?.fields ?? []) : []);
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="step-data-title">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="step-data-title" className="text-[13px] font-semibold">
          {step.stepType === "FIBER" ? t("originData") : t("supplierData")}
        </h3>
        {who && <span className="text-[11px] text-muted-foreground">{who}</span>}
      </div>
      <dl className="rounded-lg border">
        {rows.map((row) => (
          <div
            key={row.field}
            className={`grid grid-cols-[140px_minmax(0,1fr)] gap-3 border-b px-3 py-2.5 text-[13px] last:border-b-0 ${
              marked.has(row.field) ? "bg-status-rejected-muted/60" : ""
            }`}
          >
            <dt className="text-muted-foreground">{t(`fields.${row.field}`)}</dt>
            <dd className={row.value ? "font-medium" : "text-muted-foreground"}>{row.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function useRows(step: ChainStep) {
  const t = useTranslations("batches.chain.panel");
  const tFiber = useTranslations("enums.fiber");
  const tEnergy = useTranslations("enums.energySource");
  const tYarn = useTranslations("enums.yarnProcess");
  const tDye = useTranslations("enums.dyeProcess");
  const tChemical = useTranslations("enums.chemicalStandard");
  const locale = useLocale();
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  return stepDataRows(step.stepType, step.data, locale, {
    fiber: (f) => tFiber(f),
    energySource: (s) => tEnergy(s),
    yarnProcess: (p) => tYarn(p),
    dyeProcess: (p) => tDye(p),
    chemicalStandard: (c) => tChemical(c),
    country: (code) => regions.of(code) ?? code,
    unit: (unit, value) => t(`units.${unit}`, { value }),
  });
}

/** The correction asked for, while the step waits for a new link and the supplier's answer. */
function RejectionBox({ step }: { step: ChainStep }) {
  const t = useTranslations("batches.chain.panel");
  const dateTime = useDateTime();
  const rejection = step.rejection!;
  const fields = rejection.fields.map((f) => t(`fields.${f}` as never)).join(", ");
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-status-rejected bg-status-rejected-muted px-3.5 py-3 text-[13px] leading-[1.45] text-status-rejected-foreground">
      <span className="flex items-center gap-2 font-semibold">
        <CircleAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {t("rejected.title", { date: dateTime(rejection.at) })}
      </span>
      <q className="text-foreground">{rejection.reason}</q>
      {fields && <span>{t("rejected.fields", { fields })}</span>}
      <span>{t("rejected.next")}</span>
    </div>
  );
}

/** 47b: presets for the step type (each marks its fields on the supplier's form) and the reason. */
function FixSection({
  batchId,
  step,
  onCancel,
  onSent,
}: {
  batchId: string;
  step: ChainStep;
  onCancel: () => void;
  onSent: () => void;
}) {
  const t = useTranslations("batches.chain.panel.fix");
  const id = useId();
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const reject = useRejectStep(batchId);
  const presets = CORRECTION_PRESETS.filter((p) => (p.stepTypes as readonly StepType[]).includes(step.stepType));

  const pick = (preset: (typeof presets)[number]) => {
    const text = t(`presets.${preset.key}`);
    setReason((r) => (r.trim() ? `${r.trim()} ${text}.` : `${text}.`));
    setFields((f) => [...new Set([...f, ...preset.fields])]);
  };
  const send = () =>
    reject.mutate(
      { stepId: step.id, reason: reason.trim(), fields },
      { onSuccess: onSent, onError: (error) => showErrorToast({ title: t("failed"), error, keepsForm: true, onRetry: send }) },
    );

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2.5 rounded-[10px] border bg-muted p-3.5">
      <h3 id={`${id}-title`} className="text-[13px] font-semibold">
        {t("title")}
      </h3>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pick(p)}
              className="h-7 cursor-pointer rounded-full border border-input bg-card px-2.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
            >
              {t(`presets.${p.key}`)}
            </button>
          ))}
        </div>
      )}
      <label htmlFor={`${id}-reason`} className="flex flex-col gap-1.5 text-[13px] font-medium">
        {t("reason")}
        <Textarea
          id={`${id}-reason`}
          rows={4}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("placeholder")}
          className="bg-card text-[13px] font-normal"
        />
      </label>
      <span className="text-xs text-muted-foreground">{t("hint")}</span>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={send} disabled={!reason.trim() || reject.isPending}>
          {t("send")}
        </Button>
      </div>
    </section>
  );
}

type OriginErrors = Partial<Record<"fiberType" | "originCountry" | "originRegion" | "harvestYear" | "quantityKg", string>>;

/**
 * The fibre origin, entered by the manufacturer (PLAN M4; the form uses the section of design v0.4 40a). Saving
 * approves the step; until the batch is published "Düzenle" opens the form again.
 */
function OriginPanel({ batch, step, canWrite }: { batch: PanelBatch; step: ChainStep; canWrite: boolean }) {
  const t = useTranslations("batches.chain.panel.origin");
  const tPanel = useTranslations("batches.chain.panel");
  const tFiber = useTranslations("enums.fiber");
  const tField = useTranslations("errors.field");
  const locale = useLocale();
  const dateTime = useDateTime();
  const id = useId();
  const entered = !!step.data.fiberType;
  const [editing, setEditing] = useState(!entered && canWrite && !batch.published);
  const [values, setValues] = useState({
    fiberType: step.data.fiberType ?? "",
    originCountry: step.data.originCountry ?? "",
    originRegion: step.data.originRegion ?? "",
    harvestYear: step.data.harvestYear != null ? String(step.data.harvestYear) : "",
    quantityKg: step.data.quantityKg != null ? String(step.data.quantityKg) : "",
  });
  const [errors, setErrors] = useState<OriginErrors>({});
  const save = useSaveOrigin(batch.id);
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const countries = [...ORIGIN_COUNTRIES]
    .map((code) => ({ code, name: regions.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  const number = (text: string) => {
    const n = Number(text.trim().replace(",", "."));
    return text.trim() === "" ? undefined : Number.isFinite(n) ? n : Number.NaN;
  };

  const submit = () => {
    const local: OriginErrors = {};
    if (Number.isNaN(number(values.harvestYear))) local.harvestYear = tField("Integer");
    if (Number.isNaN(number(values.quantityKg))) local.quantityKg = tField("Positive");
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    const data: StepData = {
      fiberType: (values.fiberType || undefined) as Fiber | undefined,
      originCountry: values.originCountry || undefined,
      originRegion: values.originRegion.trim() || undefined,
      harvestYear: number(values.harvestYear),
      quantityKg: number(values.quantityKg),
    };
    save.mutate(
      { stepId: step.id, data },
      {
        onSuccess: () => {
          setErrors({});
          setEditing(false);
        },
        onError: (error) => {
          const fieldErrors = error instanceof ApiError ? (error.problem?.errors ?? []) : [];
          if (fieldErrors.length === 0) {
            showErrorToast({ title: t("failed"), error, keepsForm: true, onRetry: submit });
            return;
          }
          const next: OriginErrors = {};
          for (const e of fieldErrors) {
            const key = e.field.replace(/^data\./, "") as keyof OriginErrors;
            next[key] = tField.has(e.code as never) ? tField(e.code as never) : e.code;
          }
          setErrors(next);
        },
      },
    );
  };

  if (!editing) {
    return (
      <>
        <SheetBody className="gap-[22px]">
          <StepData step={step} who={step.approvedAt ? tPanel("declared", { date: dateTime(step.approvedAt) }) : undefined} />
          {batch.published && <p className="text-xs text-muted-foreground">{t("locked")}</p>}
        </SheetBody>
        <SheetFooter>
          <span className="ml-auto flex">
            <GuardedButton allowed={canWrite} tooltipSide="top" variant="secondary" disabled={batch.published} onClick={() => setEditing(true)}>
              {t("edit")}
            </GuardedButton>
          </span>
        </SheetFooter>
      </>
    );
  }

  const field = (key: keyof OriginErrors, label: string, control: React.ReactNode, optional = false) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${key}`} className="flex flex-col text-[13px] font-medium">
        {label}
        {optional && <span className="text-xs font-normal text-muted-foreground">{t("optional")}</span>}
      </label>
      {control}
      {errors[key] && (
        <span id={`${id}-${key}-error`} className="text-xs text-status-rejected-foreground">
          {errors[key]}
        </span>
      )}
    </div>
  );
  const invalid = (key: keyof OriginErrors) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `${id}-${key}-error` } : {};

  return (
    <>
      <SheetBody className="gap-[22px]">
        <form
          id={`${id}-form`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3 rounded-xl border bg-card p-4"
        >
          <div className="flex flex-col gap-0.5">
            <h3 className="flex items-baseline gap-2 text-base font-semibold">
              <span className="font-mono text-xs font-medium text-muted-foreground">01</span>
              {t("title")}
            </h3>
            <p className="text-[13px] text-muted-foreground">{t("sub")}</p>
          </div>
          {field(
            "fiberType",
            tPanel("fields.fiberType"),
            <NativeSelect id={`${id}-fiberType`} value={values.fiberType} onChange={set("fiberType")} {...invalid("fiberType")}>
              <option value="">{t("fiberPlaceholder")}</option>
              {FIBERS.map((f) => (
                <option key={f} value={f}>
                  {tFiber(f)}
                </option>
              ))}
            </NativeSelect>,
          )}
          {field(
            "originCountry",
            tPanel("fields.originCountry"),
            <NativeSelect id={`${id}-originCountry`} value={values.originCountry} onChange={set("originCountry")} {...invalid("originCountry")}>
              <option value="">{t("countryPlaceholder")}</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>,
          )}
          {field(
            "originRegion",
            tPanel("fields.originRegion"),
            <Input id={`${id}-originRegion`} value={values.originRegion} onChange={set("originRegion")} maxLength={100} placeholder={t("regionPlaceholder")} className="h-9 text-[13px]" {...invalid("originRegion")} />,
            true,
          )}
          <div className="grid grid-cols-2 gap-3">
            {field(
              "harvestYear",
              tPanel("fields.harvestYear"),
              <Input id={`${id}-harvestYear`} inputMode="numeric" value={values.harvestYear} onChange={set("harvestYear")} className="h-9 font-mono text-[13px]" {...invalid("harvestYear")} />,
              true,
            )}
            {field(
              "quantityKg",
              tPanel("fields.quantityKg"),
              <span className="relative flex items-center">
                <Input id={`${id}-quantityKg`} inputMode="decimal" value={values.quantityKg} onChange={set("quantityKg")} className="h-9 pr-9 font-mono text-[13px]" {...invalid("quantityKg")} />
                <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground" aria-hidden>
                  kg
                </span>
              </span>,
              true,
            )}
          </div>
        </form>
      </SheetBody>
      <SheetFooter>
        {entered && (
          <Button variant="ghost" className="ml-auto" onClick={() => setEditing(false)}>
            {t("cancel")}
          </Button>
        )}
        <Button type="submit" form={`${id}-form`} className={`px-4 ${entered ? "" : "ml-auto"}`} disabled={save.isPending}>
          <Check className="size-3.5" strokeWidth={2} aria-hidden />
          {t("save")}
        </Button>
      </SheetFooter>
    </>
  );
}
