import type { Fiber, StepType } from "@tekpas/shared";
import { Check, CircleAlert, Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { factsOf, type FactText } from "@/lib/passport/facts";
import type { PassportSnapshot, SnapshotCertificate, SnapshotStep } from "@/lib/passport/types";
import {
  certificateName,
  certificateState,
  certificatesOfStep,
  energyColor,
  energyMix,
  fiberColor,
  groupStages,
  hasEnvironmentalData,
  metrics,
} from "@/lib/passport/view";
import { formatPercent } from "@/lib/format";
import { CopyCode } from "./copy-code";
import { StageList, type StageView } from "./stage-list";

export interface PassportViewProps {
  snapshot: PassportSnapshot;
  /** "published": what a scan shows. "preview": the panel's view of what would be published (no code yet). */
  mode: "published" | "preview";
  /** The version's short verification code; absent in a preview. */
  verificationCode?: string;
  /** Today as an ISO day (Europe/Istanbul): certificate states are worked out against it. */
  today: string;
  /** The address of the page, shown in the QR verification list (e.g. kozapass.vercel.app). */
  host: string;
}

const H2 = "m-0 font-serif text-2xl font-normal tracking-[-0.015em]";
const CARD = "rounded-xl border border-story-border bg-card";
const NEEDS_CERTIFICATE: StepType[] = ["YARN", "FABRIC", "DYEING"];

/** Whole class names (Tailwind finds classes in the source text, it cannot build them from a variable). */
const TONE = {
  approved: { chip: "bg-status-approved-muted text-status-approved-foreground", dot: "bg-status-approved" },
  pending: { chip: "bg-status-pending-muted text-status-pending-foreground", dot: "bg-status-pending" },
  expiring: { chip: "bg-status-expiring-muted text-status-expiring-foreground", dot: "bg-status-expiring" },
  rejected: { chip: "bg-status-rejected-muted text-status-rejected-foreground", dot: "bg-status-rejected" },
} as const;

/**
 * The passport itself (design v0.6 KozaPassPasaport, state a): product, fibre composition, supply chain, certificates,
 * sustainability figures, the QR verification list and the passport details. It only knows the snapshot, so the same
 * component serves the public page and the panel's preview and old versions. The sections that have nothing to show
 * are left out (a consumer needs no empty boxes); a preview shows what is still missing.
 */
export function PassportView({ snapshot, mode, verificationCode, today, host }: PassportViewProps) {
  const t = useTranslations("passport");
  const tPanel = useTranslations("batches.chain.panel");
  const tStep = useTranslations("enums.stepType");
  const tFiber = useTranslations("enums.fiber");
  const tCategory = useTranslations("enums.productCategory");
  const tEnergy = useTranslations("enums.energySource");
  const tYarn = useTranslations("enums.yarnProcess");
  const tDye = useTranslations("enums.dyeProcess");
  const tChemical = useTranslations("enums.chemicalStandard");
  const locale = useLocale();
  const preview = mode === "preview";
  const { passport, manufacturer, product } = snapshot;

  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const day = (iso: string, withYear = true) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: withYear ? "numeric" : undefined, timeZone: "UTC" }).format(
      new Date(`${iso.slice(0, 10)}T00:00:00Z`),
    );
  const instantDay = (iso: string, withYear = true) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: withYear ? "numeric" : undefined, timeZone: "Europe/Istanbul" }).format(
      new Date(iso),
    );

  const text: FactText = {
    fiber: (f) => tFiber(f),
    energySource: (s) => tEnergy(s),
    yarnProcess: (p) => tYarn(p),
    dyeProcess: (p) => tDye(p),
    chemicalStandard: (c) => tChemical(c),
    country: (code) => regions.of(code) ?? code,
    unit: (unit, value) => tPanel(`units.${unit}`, { value }),
    labels: {
      origin: t("factOrigin"),
      yarn: t("factYarn"),
      fabric: t("factFabric"),
      composition: t("factComposition"),
      dye: t("factDye"),
      chemical: t("factChemical"),
      energySource: t("factEnergySource"),
      energyUse: t("factEnergyUse"),
      water: t("water"),
    },
  };

  const stages = groupStages(snapshot.supplyChain);
  const stageViews: StageView[] = stages.map((stage, index) => {
    const first = stage.steps[0];
    const merge = stage.steps.length > 1;
    const next = stages[index + 1];
    const allApproved = stage.steps.every((s) => s.approved);
    const approvedAt = stage.steps
      .map((s) => s.approvedAt)
      .filter((v): v is string => !!v)
      .sort()
      .at(-1);
    const inputs = stage.steps.map((step) => ({
      firm: step.actor?.name,
      place: step.actor ? [step.actor.city, step.actor.country].filter(Boolean).join(" · ") : undefined,
      facts: factsOf(step, locale, text),
      certificates: certificatesOfStep(step, snapshot.certificates).map((c) => certificateName(c.type)),
      noCertificate: preview && step.approved && NEEDS_CERTIFICATE.includes(step.type as StepType) && step.certificates.length === 0,
    }));
    const firms = inputs.filter((i) => i.firm).map((i) => `${i.firm} · ${i.place?.split(" · ").at(-1) ?? ""}`.replace(/ · $/, ""));
    const title = merge
      ? t("yarnsTitle", { count: stage.steps.length, stage: tStep(stage.type) })
      : stage.type === "FIBER" && first.data?.fiberType
        ? t("fiberTitle", { fiber: tFiber(first.data.fiberType as Fiber) })
        : (first.actor?.name ?? tStep(stage.type));
    return {
      id: `stage-${index}`,
      type: stage.type,
      stage: tStep(stage.type),
      title,
      summary: merge ? firms.join(", ") : (inputs[0].place || inputs[0].facts[0]?.value || ""),
      merge: merge && next ? t("mergeInputs", { count: stage.steps.length, next: tStep(next.type) }) : undefined,
      inputs,
      approvalText: allApproved && approvedAt ? t("approved", { date: instantDay(approvedAt, false) }) : t("pendingApproval"),
      pending: !allApproved,
      open: false,
    };
  });
  const openIndex = Math.max(0, stageViews.findIndex((s) => s.merge));
  if (stageViews[openIndex]) stageViews[openIndex].open = true;

  const fibers = product.fiberComposition ?? [];
  const fabric = snapshot.supplyChain.find((s) => s.type === "FABRIC" && s.approved && s.data?.fabricType);
  const fabricFacts = fabric ? factsOf(fabric, locale, text).filter((f) => f.key === "fabric") : [];
  const mix = energyMix(snapshot.supplyChain);
  const figures = metrics(snapshot.supplyChain);
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

  const date = passport.publishedAt ? instantDay(passport.publishedAt) : "—";
  const chip = preview
    ? { tone: "pending" as const, icon: <Clock className="size-[15px]" strokeWidth={2} aria-hidden />, text: t("chipPreview", { version: passport.version }) }
    : {
        tone: "approved" as const,
        icon: <Check className="size-[15px]" strokeWidth={2} aria-hidden />,
        text: t("chipVerified", { version: passport.version, date }),
      };

  const checks: { key: string; label: string; value: string; mono: boolean; ok: boolean }[] = [
    { key: "address", label: t("checkAddress"), value: host, mono: true, ok: true },
    { key: "product", label: t("checkProduct"), value: `(01) ${passport.gtin} · (10) ${passport.batchNo}`, mono: true, ok: true },
    { key: "version", label: t("checkVersion"), value: preview ? t("versionPreview") : t("versionCurrent", { version: passport.version }), mono: false, ok: !preview },
    { key: "code", label: t("checkCode"), value: verificationCode ?? t("codePending"), mono: false, ok: !preview },
  ];

  return (
    <>
      <section className="flex flex-col gap-3.5">
        <span className="text-[13px] font-medium tracking-[0.06em] text-brand-text uppercase">{tCategory(product.category)}</span>
        <h1 className="m-0 text-balance font-serif text-[clamp(34px,8.6cqi,52px)] leading-[1.05] font-normal tracking-[-0.025em]">{product.name}</h1>
        <span className="text-base text-muted-foreground">
          {manufacturer.name}
          {manufacturer.city ? ` · ${manufacturer.city}, ${manufacturer.country}` : ` · ${manufacturer.country}`}
        </span>
        <span className="font-mono text-sm tabular-nums break-all hyphens-none">
          (01) {passport.gtin} · (10) {passport.batchNo}
        </span>
        <span
          className={`mt-1 inline-flex min-h-[30px] max-w-full items-center gap-[7px] self-start rounded-full py-1 pr-3 pl-[9px] text-sm font-medium ${TONE[chip.tone].chip}`}
        >
          {chip.icon}
          <span className="min-w-0">{chip.text}</span>
        </span>
      </section>

      {fibers.length > 0 && (
        <section aria-labelledby="h-fiber" className="flex flex-col gap-3.5">
          <h2 id="h-fiber" className={H2}>
            {t("fiber")}
          </h2>
          <div className={`${CARD} flex flex-col gap-3.5 p-[18px]`}>
            <div
              role="img"
              aria-label={fibers.map((f) => `${tFiber(f.fiber as Fiber)} ${formatPercent(f.percent, locale)}`).join(", ")}
              className="flex h-3.5 gap-0.5 overflow-hidden rounded-[7px]"
            >
              {fibers.map((f, i) => (
                <span key={f.fiber} style={{ flex: f.percent, background: fiberColor(i) }} />
              ))}
            </div>
            <div className="flex flex-col">
              {fibers.map((f, i) => (
                <div key={f.fiber} className={`flex min-h-9 items-center gap-2.5 ${i ? "border-t" : ""}`}>
                  <span className="size-2.5 flex-none rounded-[3px]" style={{ background: fiberColor(i) }} />
                  <span className="min-w-0 flex-1 text-[15px]">{tFiber(f.fiber as Fiber)}</span>
                  <span className="font-mono text-[15px] font-medium tabular-nums">{formatPercent(f.percent, locale)}</span>
                </div>
              ))}
            </div>
            <span className="text-[13px] text-muted-foreground">{t("fiberNote")}</span>
            {fabricFacts.length > 0 && (
              <div className="flex flex-col gap-2 border-t pt-3.5">
                <span className="text-sm font-medium">{t("matSub")}</span>
                <dl className="m-0 grid grid-cols-[fit-content(45%)_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{t("mainFabric")}</dt>
                  <dd className="m-0">{fabricFacts[0].value}</dd>
                </dl>
              </div>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="h-chain" className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <h2 id="h-chain" className={H2}>
            {t("chain")}
          </h2>
          <span className="text-sm text-muted-foreground">{t("chainSub")}</span>
        </div>
        <StageList stages={stageViews} productLine={t("product", { name: product.name })} noCertificateText={t("noCertYet")} />
      </section>

      <CertificateSection certificates={snapshot.certificates} steps={snapshot.supplyChain} today={today} day={day} />

      {(hasEnvironmentalData(snapshot.supplyChain) || preview) && (
        <section aria-labelledby="h-env" className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <h2 id="h-env" className={H2}>
              {t("env")}
            </h2>
            {hasEnvironmentalData(snapshot.supplyChain) && <span className="text-sm text-muted-foreground">{t("envSub")}</span>}
          </div>
          {hasEnvironmentalData(snapshot.supplyChain) ? (
            <div className={`${CARD} flex flex-col gap-[18px] p-[18px]`}>
              {mix.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="text-sm font-medium">{t("energyMix")}</span>
                  <div
                    role="img"
                    aria-label={mix.map((e) => `${tEnergy(e.source as never)} ${formatPercent(Math.round(e.percent), locale)}`).join(", ")}
                    className="flex h-3.5 gap-0.5 overflow-hidden rounded-[7px]"
                  >
                    {mix.map((e) => (
                      <span key={e.source} style={{ flex: e.percent, background: energyColor(e.source) }} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-[18px] gap-y-1.5">
                    {mix.map((e) => (
                      <span key={e.source} className="flex items-center gap-[7px] text-sm">
                        <span className="size-2.5 rounded-[3px]" style={{ background: energyColor(e.source) }} />
                        {tEnergy(e.source as never)}{" "}
                        <span className="font-mono text-muted-foreground">{formatPercent(Math.round(e.percent), locale)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(figures.waterLPerKg != null || figures.energyKwhPerKg != null) && (
                <div className={`grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 ${mix.length ? "border-t pt-4" : ""}`}>
                  {figures.waterLPerKg != null && <Metric label={t("water")} value={number(figures.waterLPerKg)} unit="L/kg" />}
                  {figures.energyKwhPerKg != null && <Metric label={t("energy")} value={number(figures.energyKwhPerKg)} unit="kWh/kg" />}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-input px-[18px] py-[22px] text-sm text-muted-foreground">{t("envNone")}</div>
          )}
        </section>
      )}

      <section aria-labelledby="h-verify" className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <h2 id="h-verify" className={H2}>
            {t("verify")}
          </h2>
          <span className="text-sm text-muted-foreground">{t("verifySub")}</span>
        </div>
        <ul className={`${CARD} m-0 flex list-none flex-col p-0`}>
          {checks.map((c, i) => (
            <li key={c.key} className={`flex items-start gap-3 px-4 py-3.5 ${i ? "border-t" : ""}`}>
              {c.ok ? (
                <Check className="mt-0.5 size-[18px] flex-none text-status-approved-foreground" strokeWidth={2} aria-hidden />
              ) : (
                <Clock className="mt-0.5 size-[18px] flex-none text-muted-foreground" strokeWidth={2} aria-hidden />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">{c.label}</span>
                <span className={`text-sm break-all hyphens-none text-muted-foreground ${c.mono ? "font-mono" : ""}`}>{c.value}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="h-info" className="flex flex-col gap-3.5 border-t border-story-border pt-7">
        <h2 id="h-info" className="m-0 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {t("info")}
        </h2>
        <dl className="m-0 grid grid-cols-[fit-content(45%)_minmax(0,1fr)] gap-x-[18px] gap-y-2.5 text-[15px]">
          <dt className="text-muted-foreground">{t("version")}</dt>
          <dd className="m-0">{passport.version}</dd>
          <dt className="text-muted-foreground">{t("published")}</dt>
          <dd className="m-0">{date}</dd>
          <dt className="text-muted-foreground">{t("publisher")}</dt>
          <dd className="m-0">{manufacturer.name}</dd>
          <dt className="self-center text-muted-foreground">{t("code")}</dt>
          <dd className="m-0 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[15px] font-medium tracking-[0.04em]">{verificationCode ?? t("codePending")}</span>
            {verificationCode && <CopyCode code={verificationCode} copyLabel={t("copy")} copiedLabel={t("copied")} />}
          </dd>
        </dl>
        <span className="text-[13px] leading-normal text-pretty text-muted-foreground">{t("codeNote")}</span>
      </section>
    </>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-mono text-[28px] font-medium tracking-[-0.03em] tabular-nums">{value}</span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}

function CertificateSection({
  certificates,
  steps,
  today,
  day,
}: {
  certificates: SnapshotCertificate[];
  steps: SnapshotStep[];
  today: string;
  day: (iso: string) => string;
}) {
  const t = useTranslations("passport");
  const tStep = useTranslations("enums.stepType");
  if (certificates.length === 0) return null;
  const stepOf = (key: string) => steps.find((s) => s.certificates.includes(key));
  return (
    <section aria-labelledby="h-cert" className="flex flex-col gap-3.5">
      <h2 id="h-cert" className={H2}>
        {t("certs")}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
        {certificates.map((c) => {
          const state = certificateState(c.validUntil, today);
          const tone = TONE[state === "valid" ? "approved" : state === "expiring" ? "expiring" : "rejected"];
          const owner = stepOf(c.key);
          return (
            <article key={c.key} className={`${CARD} flex flex-col gap-3 p-4`}>
              <div className="flex flex-wrap items-start gap-2.5">
                <span className="flex min-w-[150px] flex-1 flex-col gap-0.5">
                  <strong className="text-[17px] font-semibold tracking-[-0.01em]">{certificateName(c.type)}</strong>
                  {c.certNo && <span className="font-mono text-[13px] break-all hyphens-none text-muted-foreground">{c.certNo}</span>}
                </span>
                <span className={`inline-flex min-h-[26px] items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-[13px] font-medium ${tone.chip}`}>
                  {state === "expired" ? (
                    <CircleAlert className="size-3 flex-none" strokeWidth={2.2} aria-hidden />
                  ) : (
                    <span className={`size-1.5 flex-none rounded-full ${tone.dot}`} aria-hidden />
                  )}
                  {state === "valid" ? t("certValid") : state === "expiring" ? t("certExpiring") : t("certExpired")}
                </span>
              </div>
              <dl className="m-0 grid grid-cols-[fit-content(45%)_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-sm">
                {c.holder && (
                  <>
                    <dt className="text-muted-foreground">{t("holder")}</dt>
                    <dd className="m-0">{c.holder}</dd>
                  </>
                )}
                {c.issuer && (
                  <>
                    <dt className="text-muted-foreground">{t("issuer")}</dt>
                    <dd className="m-0">{c.issuer}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">{t("valid")}</dt>
                <dd className="m-0 tabular-nums">{c.validFrom ? `${day(c.validFrom)} – ${day(c.validUntil)}` : day(c.validUntil)}</dd>
                {owner && (
                  <>
                    <dt className="text-muted-foreground">{t("step")}</dt>
                    <dd className="m-0">{tStep(owner.type)}</dd>
                  </>
                )}
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
