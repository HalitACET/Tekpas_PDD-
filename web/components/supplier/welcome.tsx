"use client";

import type { StepType } from "@tekpas/shared";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PublicRequestView } from "@/lib/api/public-request";
import { sectionsFor } from "@/lib/supplier-request/form";
import { ContactLine, daysLeft, FactList, FirmTile, useDates } from "./frame";

/** The bullets of "Sizden istenenler": one per section (the yarn's delivery section asks two things). */
export function asksFor(type: StepType): string[] {
  return sectionsFor(type).flatMap((section) => {
    if (section === "delivery") return ["deliveryKg", "deliveryYarn"];
    return [section];
  });
}

/** "7 gün kaldı" as a pill; grey, like a waiting step (design 39). */
export function DaysLeftPill({ expiresAt, now }: { expiresAt: string; now: Date }) {
  const t = useTranslations("supplier");
  const left = daysLeft(expiresAt, now);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-status-pending-muted py-[3px] pr-2.5 pl-2 text-[13px] font-medium whitespace-nowrap text-status-pending-foreground">
      <span className="size-1.5 rounded-full bg-status-pending" aria-hidden />
      {left.text === "hours" ? t("hoursLeft") : t("daysLeft", { days: left.days })}
    </span>
  );
}

/** Design 39: who asks, what for, what is asked, and the way in. */
export function Welcome({
  view,
  stepName,
  now,
  onStart,
}: {
  view: PublicRequestView;
  stepName: string;
  now: Date;
  onStart: () => void;
}) {
  const t = useTranslations("supplier.welcome");
  const dates = useDates();
  const stepLower = stepName.toLocaleLowerCase();
  const asks = asksFor(view.stepType);

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div className="flex items-center gap-3">
        <FirmTile name={view.manufacturerName} />
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{view.manufacturerName}</span>
          <span className="text-[13px] text-muted-foreground">{t("asksYou")}</span>
        </span>
      </div>
      <h1 className="font-serif text-[32px] leading-[1.1] font-normal tracking-[-0.02em] text-pretty">
        {t("title", { step: stepName, stepLower })}
      </h1>
      <p className="text-base leading-[1.55] text-pretty text-muted-foreground">{t("body", { step: stepName, stepLower })}</p>
      <FactList
        rows={[
          { label: t("product"), value: view.productName },
          { label: t("batch"), value: view.batchNo, mono: true },
          { label: t("step"), value: stepName },
          { label: t("deadline"), value: dates.long(view.expiresAt) },
          { label: t("remaining"), value: <DaysLeftPill expiresAt={view.expiresAt} now={now} /> },
        ]}
      />
      <section className="flex flex-col gap-2.5" aria-labelledby="asks-title">
        <h2 id="asks-title" className="text-sm font-semibold">
          {t("asksTitle")}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {asks.map((ask) => (
            <li key={ask} className="flex items-center gap-2.5 text-[15px]">
              <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              {t(`asks.${ask}` as never)}
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted-foreground">{t("time")}</p>
      </section>
      <Button size="xl" className="w-full" onClick={onStart}>
        {t("start")}
      </Button>
      <div className="flex gap-2.5 rounded-xl bg-muted px-4 py-3.5 text-sm leading-normal">
        <Lock className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <p>
          <span className="font-medium">{t("secureTitle")}</span> {t("secureBody", { manufacturer: view.manufacturerName })}
        </p>
      </div>
      <div className="px-0 py-1 text-[15px]">
        <ContactLine name={view.requesterName} manufacturer={view.manufacturerName} />
      </div>
    </div>
  );
}
