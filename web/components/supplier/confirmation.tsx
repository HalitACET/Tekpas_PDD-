"use client";

import { Check, File } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { PublicRequestView, PublicSubmitResponse } from "@/lib/api/public-request";
import { fiberText, formatPercent } from "@/lib/format";
import { energyUnit, parsePercent, sectionsFor, type SubmissionValues } from "@/lib/supplier-request/form";
import { FactList, useDates } from "./frame";

/** Design 43: what was sent, and what happens next. The rows follow the sections of the step. */
export function Confirmation({
  view,
  response,
  values,
  documents,
  stepName,
}: {
  view: PublicRequestView;
  response: PublicSubmitResponse;
  values: SubmissionValues;
  /** The names of the documents uploaded through the link (nothing else about them is shown). */
  documents: string[];
  stepName: string;
}) {
  const t = useTranslations("supplier.done");
  const tFiber = useTranslations("enums.fiber");
  const tSource = useTranslations("enums.energySource");
  const tYarn = useTranslations("enums.yarnProcess");
  const tDye = useTranslations("enums.dyeProcess");
  const tStandard = useTranslations("enums.chemicalStandard");
  const locale = useLocale();
  const dates = useDates();
  const type = view.stepType;
  const sections = sectionsFor(type);
  const has = (id: (typeof sections)[number]) => sections.includes(id);
  const country = (code: string) => new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  const text = (value: string) => value.trim();
  const rows: { label: string; value: ReactNode; top?: boolean }[] = [];
  const add = (label: string, value: string | undefined | false) => {
    if (value) rows.push({ label, value });
  };

  if (has("dye")) {
    const process = values.dyeProcess === "OTHER" ? text(values.dyeProcessOther) : values.dyeProcess ? tDye(values.dyeProcess) : "";
    add(t("rows.process"), [process, text(values.shade)].filter(Boolean).join(" · "));
    add(t("rows.chemicals"), values.chemicalStandards.map((s) => tStandard(s)).join(", "));
  }
  if (has("fibers")) {
    const composition = values.fibers.map((r) => ({ fiber: r.fiber, percent: parsePercent(r.percent) ?? 0 }));
    add(t("rows.fibers"), fiberText(composition, locale, (fiber) => tFiber(fiber)));
  }
  if (has("fibers") || has("origin")) add(t("rows.origin"), values.originCountry && country(values.originCountry));
  if (has("fabric")) {
    add(t("rows.fabricType"), text(values.fabricType));
    add(t("rows.gsm"), text(values.gsm) && `${text(values.gsm)} g/m²`);
  }
  if (has("quantity")) {
    add(t("rows.processed"), text(values.deliveredKg) && `${text(values.deliveredKg)} kg`);
    add(t("rows.water"), text(values.waterLPerKg) && `${text(values.waterLPerKg)} L/kg`);
  }
  if (has("energy")) {
    const mix = values.energy
      .filter((r) => r.percent.trim() !== "")
      .map((r) => `${tSource(r.source)} ${formatPercent(parsePercent(r.percent) ?? 0, locale)}`)
      .join(" · ");
    add(t("rows.energy"), mix);
    const unit = energyUnit(type);
    if (unit === "KWH_PER_KG") add(t("rows.kwh"), text(values.energyKwhPerKg) && `${text(values.energyKwhPerKg)} kWh/kg`);
    if (unit === "KWH_PER_PIECE") add(t("rows.kwh"), text(values.energyKwhPerPiece) && `${text(values.energyKwhPerPiece)} kWh`);
  }
  if (has("delivery") || has("fabric")) add(t("rows.delivered"), text(values.deliveredKg) && `${text(values.deliveredKg)} kg`);
  if (has("delivery")) {
    const spinning = values.yarnProcess ? tYarn(values.yarnProcess) : "";
    add(t("rows.yarn"), [text(values.yarnCount) && `Ne ${text(values.yarnCount)}`, spinning].filter(Boolean).join(" · "));
  }
  if (documents.length > 0) {
    rows.push({
      label: t("rows.documents", { count: documents.length }),
      top: true,
      value: (
        <ul className="flex min-w-0 flex-col items-end gap-1.5">
          {documents.map((name) => (
            <li key={name} className="flex max-w-full items-center gap-1.5 font-mono text-[13px] font-normal">
              <File className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              <span dir="auto" className="truncate">
                {name}
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  add(t("rows.sender"), [text(values.submitterName), text(values.submitterRole)].filter(Boolean).join(" · "));

  return (
    <div className="flex flex-col gap-5 pt-4">
      <span className="flex size-14 items-center justify-center rounded-full bg-status-approved-muted text-status-approved-foreground">
        <Check className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-[32px] leading-[1.1] font-normal tracking-[-0.02em]">
          {t("title", { manufacturer: response.manufacturerName })}
        </h1>
        <p className="text-[15px] leading-normal text-muted-foreground">{t("thanks", { when: dates.dateTime(response.submittedAt) })}</p>
      </div>
      <FactList
        title={<h2 className="text-sm font-semibold">{t("summary", { step: stepName })}</h2>}
        trailing={<span className="font-mono text-xs text-muted-foreground">{t("code", { code: response.code })}</span>}
        rows={rows}
      />
      <section className="flex flex-col gap-2 text-sm leading-[1.55]">
        <h2 className="font-semibold">{t("nextTitle")}</h2>
        <p className="text-muted-foreground">{t("next", { manufacturer: response.manufacturerName })}</p>
        <p className="text-muted-foreground">{t("close")}</p>
      </section>
    </div>
  );
}
