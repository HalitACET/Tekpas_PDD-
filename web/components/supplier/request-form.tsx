"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CHEMICAL_STANDARDS,
  DOCUMENTS_FIELD,
  type DyeProcess,
  DYE_PROCESSES,
  ENERGY_SOURCES,
  type Fiber,
  FIBERS,
  ORIGIN_COUNTRIES,
  type StepType,
  YARN_PROCESSES,
} from "@tekpas/shared";
import { CircleAlert, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import type { PublicRequestView, PublicSubmitResponse } from "@/lib/api/public-request";
import { useSubmitPublicRequest } from "@/lib/api/public-request";
import { ApiError } from "@/lib/api/request";
import {
  energyUnit,
  formPathOf,
  SECTION_FIELDS,
  type SectionId,
  sectionsFor,
  type SubmissionValues,
  submissionSchema,
  toStepData,
  valuesFrom,
} from "@/lib/supplier-request/form";
import { cn } from "@/lib/utils";
import {
  ChemicalChips,
  ErrorLine,
  errorFieldCount,
  Field,
  FormInfoProvider,
  Section,
  Segmented,
  SelectInput,
  ShareRows,
  TextInput,
  UnitInput,
  useErrorText,
  useFieldError,
  useFormInfo,
} from "./fields";
import { DocumentsSection, useSupplierDocuments } from "./documents-section";
import { ContactLine, FirmTile, useDates } from "./frame";
import { DaysLeftPill } from "./welcome";

function capitalise(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Design 40c: on a wide screen the facts of the request sit beside the form. */
export function FormAside({ view, stepName, now }: { view: PublicRequestView; stepName: string; now: Date }) {
  const t = useTranslations("supplier.welcome");
  const dates = useDates();
  const rows = [
    { label: t("product"), value: view.productName },
    { label: t("batch"), value: view.batchNo, mono: true },
    { label: t("step"), value: stepName },
    { label: t("deadline"), value: dates.long(view.expiresAt) },
  ];
  return (
    <>
      <div className="flex items-center gap-3">
        <FirmTile name={view.manufacturerName} />
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{view.manufacturerName}</span>
          <span className="text-[13px] text-muted-foreground">{t("asksYou")}</span>
        </span>
      </div>
      <dl className="rounded-xl border border-border bg-card">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5 border-b border-border px-4 py-3">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className={cn("text-sm font-medium", row.mono && "font-mono")}>{row.value}</dd>
          </div>
        ))}
        <div className="flex items-center px-4 py-3">
          <DaysLeftPill expiresAt={view.expiresAt} now={now} />
        </div>
      </dl>
      <div className="flex gap-2.5 rounded-xl bg-muted px-4 py-3.5 text-[13px] leading-normal">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <p>
          <span className="font-medium">{t("secureTitle")}</span> {t("secureBody", { manufacturer: view.manufacturerName })}
        </p>
      </div>
      <ContactLine name={view.requesterName} manufacturer={view.manufacturerName} />
    </>
  );
}

/** The country list, named and sorted in the page's language; a country the API already holds is kept. */
function useCountryOptions(current: string) {
  const locale = useLocale();
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    const codes: string[] = [...ORIGIN_COUNTRIES];
    if (current && !codes.includes(current)) codes.push(current);
    return codes
      .map((code) => ({ code, name: names.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale, current]);
}

function OriginField({ type, required }: { type: StepType; required: boolean }) {
  const t = useTranslations("supplier.form");
  const tText = useErrorText();
  const { register, control } = useFormContext<SubmissionValues>();
  const { flagged } = useFormInfo();
  const current = useWatch({ control, name: "originCountry" });
  const countries = useCountryOptions(current);
  const code = useFieldError("originCountry");
  const hintKey = type === "YARN" || type === "FABRIC" || type === "SEWING" ? type : "OTHER";
  return (
    <Field
      label={t("sections.origin.label")}
      hint={t(`sections.origin.hint.${hintKey}`)}
      optional={!required}
      error={code ? tText(code) : undefined}
      flagged={flagged.has("originCountry")}
    >
      {(control) => (
        <SelectInput {...control} {...register("originCountry")}>
          <option value="">{t("pickCountry")}</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectInput>
      )}
    </Field>
  );
}

function NumberField({
  name,
  label,
  hint,
  unit,
  placeholder = "0",
  optional = true,
}: {
  name: "energyKwhPerKg" | "energyKwhPerPiece" | "deliveredKg" | "gsm" | "waterLPerKg";
  label: string;
  hint?: string;
  unit: string;
  placeholder?: string;
  optional?: boolean;
}) {
  const tText = useErrorText();
  const { register } = useFormContext<SubmissionValues>();
  const { flagged } = useFormInfo();
  const code = useFieldError(name);
  const apiName = name;
  return (
    <Field label={label} hint={hint} optional={optional} error={code ? tText(code) : undefined} flagged={flagged.has(apiName)}>
      {(control) => <UnitInput unit={unit} placeholder={placeholder} {...control} {...register(name)} />}
    </Field>
  );
}

function TextField({
  name,
  label,
  placeholder,
  optional,
  hint,
  autoComplete,
}: {
  name: "fabricType" | "shade" | "dyeProcessOther" | "submitterName" | "submitterRole";
  label: string;
  placeholder?: string;
  optional?: boolean;
  hint?: string;
  autoComplete?: string;
}) {
  const tText = useErrorText();
  const { register } = useFormContext<SubmissionValues>();
  const { flagged } = useFormInfo();
  const code = useFieldError(name);
  return (
    <Field label={label} hint={hint} optional={optional} error={code ? tText(code) : undefined} flagged={flagged.has(name)}>
      {(control) => <TextInput placeholder={placeholder} autoComplete={autoComplete} {...control} {...register(name)} />}
    </Field>
  );
}

function FibersSection({ type, number, flagged }: { type: StepType; number: string; flagged: boolean }) {
  const t = useTranslations("supplier.form.sections.fibers");
  const tFiber = useTranslations("enums.fiber");
  const { flagged: fields } = useFormInfo();
  const sub = type === "FABRIC" ? "FABRIC" : "YARN";
  return (
    <Section id="section-fibers" number={number} title={t("title")} sub={t(`sub.${sub}`)} flagged={flagged}>
      <ShareRows
        name="fibers"
        kind="fiber"
        options={FIBERS}
        optionLabel={(o) => tFiber(o as Fiber)}
        kindLabel={t("fiber")}
        addLabel={t("add")}
        newRow="ELASTANE"
        flagged={fields.has("fiberComposition")}
      />
      <div className="border-t border-border pt-3">
        <OriginField type={type} required={type === "YARN"} />
      </div>
    </Section>
  );
}

function OriginSection({ type, number, flagged }: { type: StepType; number: string; flagged: boolean }) {
  const t = useTranslations("supplier.form.sections.origin");
  return (
    <Section id="section-origin" number={number} title={t("title")} flagged={flagged}>
      <OriginField type={type} required={type === "SEWING"} />
    </Section>
  );
}

function EnergySection({ type, number, flagged }: { type: StepType; number: string; flagged: boolean }) {
  const t = useTranslations("supplier.form.sections.energy");
  const tSource = useTranslations("enums.energySource");
  const { flagged: fields } = useFormInfo();
  const unit = energyUnit(type);
  return (
    <Section id="section-energy" number={number} title={t("title")} sub={t("sub")} optional flagged={flagged}>
      <ShareRows
        name="energy"
        kind="source"
        options={ENERGY_SOURCES}
        optionLabel={(o) => tSource(o as never)}
        kindLabel={t("source")}
        addLabel={t("add")}
        newRow="NATURAL_GAS"
        flagged={fields.has("energySources")}
        idleWhenEmpty
      />
      {unit && (
        <div className="border-t border-border pt-3">
          <NumberField
            name={unit === "KWH_PER_KG" ? "energyKwhPerKg" : "energyKwhPerPiece"}
            label={t("kwh")}
            hint={unit === "KWH_PER_KG" ? t("perKg") : t("perPiece")}
            unit={unit === "KWH_PER_KG" ? t("unitKg") : t("unitPiece")}
            placeholder="0,0"
          />
        </div>
      )}
    </Section>
  );
}

function DeliverySection({ number, flagged }: { number: string; flagged: boolean }) {
  const t = useTranslations("supplier.form.sections.delivery");
  const tProcess = useTranslations("enums.yarnProcess");
  const locale = useLocale();
  const tText = useErrorText();
  const { register, control, setValue } = useFormContext<SubmissionValues>();
  const { flagged: fields } = useFormInfo();
  const spinning = useWatch({ control, name: "yarnProcess" });
  const countError = useFieldError("yarnCount");
  return (
    <Section id="section-delivery" number={number} title={t("title")} flagged={flagged}>
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="deliveredKg" label={t("delivered")} unit="kg" />
        <Field label={t("count")} optional error={countError ? tText(countError) : undefined} flagged={fields.has("yarnCount")}>
          {(c) => <UnitInput prefix="Ne" mono inputMode="text" placeholder="30/1" {...c} {...register("yarnCount")} />}
        </Field>
      </div>
      <Segmented
        label={t("spinning")}
        optional
        options={YARN_PROCESSES}
        optionLabel={(o) => capitalise(tProcess(o), locale)}
        value={spinning}
        onChange={(next) => setValue("yarnProcess", next, { shouldDirty: true })}
      />
    </Section>
  );
}

function FabricSection({ number, flagged }: { number: string; flagged: boolean }) {
  const t = useTranslations("supplier.form.sections.fabric");
  return (
    <Section id="section-fabric" number={number} title={t("title")} flagged={flagged}>
      <TextField name="fabricType" label={t("type")} placeholder={t("typePlaceholder")} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="gsm" label={t("gsm")} unit="g/m²" />
        <NumberField name="deliveredKg" label={t("delivered")} unit="kg" />
      </div>
    </Section>
  );
}

function DyeSection({ number, flagged }: { number: string; flagged: boolean }) {
  const t = useTranslations("supplier.form.sections.dye");
  const tProcess = useTranslations("enums.dyeProcess");
  const tStandard = useTranslations("enums.chemicalStandard");
  const tText = useErrorText();
  const { register, control, setValue, formState } = useFormContext<SubmissionValues>();
  const { flagged: fields } = useFormInfo();
  const process = useWatch({ control, name: "dyeProcess" });
  const standards = useWatch({ control, name: "chemicalStandards" });
  const processError = useFieldError("dyeProcess");
  const standardsError = useFieldError("chemicalStandards");
  return (
    <Section id="section-dye" number={number} title={t("title")} flagged={flagged}>
      <Field label={t("process")} error={processError ? tText(processError) : undefined} flagged={fields.has("dyeProcess")}>
        {(c) => (
          <SelectInput {...c} {...register("dyeProcess")}>
            <option value="">{t("pick")}</option>
            {DYE_PROCESSES.map((p) => (
              <option key={p} value={p}>
                {tProcess(p as DyeProcess)}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      {process === "OTHER" && <TextField name="dyeProcessOther" label={t("other")} placeholder={t("otherPlaceholder")} />}
      <TextField name="shade" label={t("shade")} placeholder={t("shadePlaceholder")} optional />
      <ChemicalChips
        options={CHEMICAL_STANDARDS}
        optionLabel={(o) => tStandard(o)}
        value={standards}
        onChange={(next) => setValue("chemicalStandards", next, { shouldDirty: true, shouldValidate: formState.isSubmitted })}
        error={standardsError ? tText(standardsError) : undefined}
        flagged={fields.has("chemicalStandards")}
      />
    </Section>
  );
}

function QuantitySection({ number, flagged }: { number: string; flagged: boolean }) {
  const t = useTranslations("supplier.form.sections.quantity");
  return (
    <Section id="section-quantity" number={number} title={t("title")} flagged={flagged}>
      <div className="grid grid-cols-2 gap-3">
        <NumberField name="deliveredKg" label={t("processed")} unit="kg" />
        <NumberField name="waterLPerKg" label={t("water")} unit="L/kg" />
      </div>
    </Section>
  );
}

function SenderSection({ number }: { number: string }) {
  const t = useTranslations("supplier.form.sections.sender");
  return (
    <Section id="section-sender" number={number} title={t("title")}>
      <TextField name="submitterName" label={t("name")} placeholder={t("namePlaceholder")} autoComplete="name" />
      <TextField name="submitterRole" label={t("role")} placeholder={t("rolePlaceholder")} optional />
    </Section>
  );
}

type Banner = "failed" | "fields" | "rateLimited";

/**
 * Designs 40, 41, 45: the form of the step. Sections follow the step type; a correction request fills the
 * previous data back in, shows the reason on top and marks (and scrolls to) the sections to correct.
 */
export function RequestForm({
  view,
  token,
  stepName,
  onSent,
  onClosed,
}: {
  view: PublicRequestView;
  token: string;
  stepName: string;
  onSent: (response: PublicSubmitResponse, values: SubmissionValues, documents: string[]) => void;
  onClosed: (error: ApiError) => void;
}) {
  const t = useTranslations("supplier.form");
  const tRate = useTranslations("supplier.rateLimited");
  const dates = useDates();
  const type = view.stepType;
  const rejection = view.rejection;
  const flagged = useMemo(() => new Set(rejection?.fields ?? []), [rejection]);
  // "Belge okunaksız" / "Sertifika süresi dolmuş": the manufacturer asks for new documents, nothing else.
  const documentsFlagged = flagged.has(DOCUMENTS_FIELD);
  const documentsOnly = documentsFlagged && flagged.size === 1;
  const docs = useSupplierDocuments({ token, initial: view.documents, onClosed });
  const sections = sectionsFor(type);
  const form = useForm<SubmissionValues>({
    resolver: zodResolver(submissionSchema(type)) as never,
    defaultValues: valuesFrom(view.data),
  });
  const send = useSubmitPublicRequest(token);
  const [banner, setBanner] = useState<Banner | undefined>();
  const errorCount = errorFieldCount(form.formState.errors as Record<string, unknown>);
  const sectionFlagged = (id: SectionId) => !!rejection && SECTION_FIELDS[id].some((f) => flagged.has(f));

  // A correction opens on the section to correct.
  useEffect(() => {
    const first = sections.find(sectionFlagged) ?? (documentsFlagged ? "documents" : undefined);
    if (!first) return;
    const frame = requestAnimationFrame(() => document.getElementById(`section-${first}`)?.scrollIntoView?.({ block: "center" }));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusFirstError = () =>
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>("[data-supplier-form] [aria-invalid='true'], [data-supplier-form] [data-invalid='true']");
      target?.scrollIntoView?.({ block: "center" });
      target?.focus({ preventScroll: true });
    });

  const submit = form.handleSubmit((values) => {
    setBanner(undefined);
    send.mutate(
      {
        data: toStepData(values, type),
        submitterName: values.submitterName.trim(),
        submitterRole: values.submitterRole.trim() || null,
      },
      {
        onSuccess: (response) => onSent(response, values, docs.uploadedNames),
        onError: (error) => {
          if (error instanceof ApiError && (error.status === 410 || error.status === 404)) return onClosed(error);
          if (error instanceof ApiError && error.status === 429) return setBanner("rateLimited");
          if (error instanceof ApiError && error.status === 400) {
            let mapped = 0;
            for (const e of error.problem?.errors ?? []) {
              const path = formPathOf(e.field);
              if (!path) continue;
              form.setError(path as never, { type: e.code, message: e.code });
              mapped++;
            }
            if (mapped > 0) focusFirstError();
            return setBanner("fields");
          }
          setBanner("failed");
        },
      },
    );
  }, focusFirstError);

  let n = 0;
  const number = () => String(++n).padStart(2, "0");

  return (
    <FormProvider {...form}>
      <FormInfoProvider value={{ flagged }}>
        <form noValidate onSubmit={submit} data-supplier-form className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5 rounded-[10px] bg-muted px-3 py-2.5 text-[13px] lg:hidden">
            <FirmTile name={view.manufacturerName} size={28} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{view.productName}</span>
              <span className="truncate text-muted-foreground">
                {view.manufacturerName} · {stepName}
              </span>
            </span>
            <span className="flex-none text-right text-xs text-muted-foreground">
              {t("deadlineShort")}
              <br />
              <span className="font-medium text-foreground">{dates.short(view.expiresAt)}</span>
            </span>
          </div>

          {rejection && (
            <div role="alert" className="flex flex-col gap-2.5 rounded-xl bg-status-rejected-muted px-4 py-3.5 text-status-rejected-foreground">
              <div className="flex items-start gap-2.5">
                <CircleAlert className="mt-px size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{t("fix.title", { manufacturer: view.manufacturerName })}</span>
                  <span className="text-[13px]">{t("fix.by", { name: rejection.byName, when: dates.dateTimeShort(rejection.at) })}</span>
                </span>
              </div>
              <blockquote className="rounded-lg border border-border bg-card px-3.5 py-3 text-[15px] leading-[1.55] text-foreground">
                “{rejection.reason}”
              </blockquote>
              <p className="text-[13px] leading-normal">{documentsOnly ? t("fix.bodyDocuments") : t("fix.body")}</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5 pt-1">
            <h1 className="font-serif text-[30px] leading-[1.1] font-normal tracking-[-0.02em]">
              {documentsOnly ? t("titleFixDocuments") : rejection ? t("titleFix", { step: stepName }) : t("title", { step: stepName })}
            </h1>
            <p className="text-sm text-muted-foreground">{t("allRequired")}</p>
          </div>

          {form.formState.submitCount > 0 && errorCount > 0 && (
            <div role="alert" className="flex items-center gap-2.5 rounded-lg bg-status-rejected-muted px-3.5 py-3 text-sm text-status-rejected-foreground">
              <CircleAlert className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
              <span>
                <span className="font-semibold">{t("errorSummary", { count: errorCount })}</span> {t("errorSummaryGo")}
              </span>
            </div>
          )}

          {sections.map((id) => {
            const props = { number: number(), flagged: sectionFlagged(id) };
            switch (id) {
              case "fibers":
                return <FibersSection key={id} type={type} {...props} />;
              case "origin":
                return <OriginSection key={id} type={type} {...props} />;
              case "energy":
                return <EnergySection key={id} type={type} {...props} />;
              case "delivery":
                return <DeliverySection key={id} {...props} />;
              case "fabric":
                return <FabricSection key={id} {...props} />;
              case "dye":
                return <DyeSection key={id} {...props} />;
              case "quantity":
                return <QuantitySection key={id} {...props} />;
            }
          })}
          <DocumentsSection number={number()} docs={docs} aiReading={view.aiReading} flagged={documentsFlagged} />
          <SenderSection number={number()} />

          <div className="flex flex-col gap-2.5 pt-1">
            {banner && (
              <div role="alert">
                <ErrorLine>
                  {banner === "fields" ? t("serverFields") : banner === "rateLimited" ? `${tRate("title")}. ${tRate("body")}` : t("submitFailed")}
                </ErrorLine>
              </div>
            )}
            <Button type="submit" size="xl" className="w-full" disabled={send.isPending || docs.busy} aria-describedby={docs.busy ? "uploads-pending" : undefined}>
              {send.isPending ? t("submitting") : rejection ? t("submitFix") : t("submit")}
            </Button>
            {docs.busy && (
              <p id="uploads-pending" role="status" className="text-center text-[13px] leading-normal text-pretty text-muted-foreground">
                {t("uploadsPending")}
              </p>
            )}
            <p className="text-center text-[13px] leading-normal text-pretty text-muted-foreground">
              {t("after", { manufacturer: view.manufacturerName })}
            </p>
          </div>
        </form>
      </FormInfoProvider>
    </FormProvider>
  );
}
