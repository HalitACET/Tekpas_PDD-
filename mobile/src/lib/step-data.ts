import type { components } from "@tekpas/api-client";
import type { TFunction } from "i18next";
import type { StatusKind } from "@/theme/colors";
import { locale } from "./format";

type StepData = components["schemas"]["StepData"];

/** One part of a share bar (fibres, energy sources): its width and its legend. */
export interface Share {
  pct: number;
  label: string;
  kind: StatusKind;
}

/** A line of the submitted data (design v0.9 103a–103b): a name, a value, and a bar when it is made of shares. */
export interface DataRow {
  key: string;
  label: string;
  value: string;
  mono: boolean;
  shares?: Share[];
}

const SHARE_KINDS: StatusKind[] = ["approved", "submitted", "lowConfidence", "expiring", "pending", "rejected"];

function number(n: number): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(n);
}

/** "Türkiye" for TR where the phone knows the name, else the code. */
function country(code: string): string {
  try {
    return new Intl.DisplayNames([locale()], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The submitted data as the review shows it, only what was filled in, in the order a supplier fills the form. The
 * enum names are the web's (web/messages enums), copied into the mobile texts.
 */
export function dataRows(data: StepData, t: TFunction): DataRow[] {
  const rows: DataRow[] = [];
  const pct = (n: number) => t("step.pct", { n: number(n) });
  const add = (key: string, value: string | undefined | null, mono = false, shares?: Share[]) => {
    if (value) rows.push({ key, label: t(`step.${key}`), value, mono, shares });
  };
  const fibers = data.fiberComposition ?? [];
  if (fibers.length > 0) {
    add(
      "fibers",
      fibers.map((f) => pct(f.percent)).join(" / "),
      true,
      fibers.map((f, i) => ({
        pct: f.percent,
        kind: SHARE_KINDS[i % SHARE_KINDS.length],
        label: t("step.share", { name: t(`enums.fiber.${f.fiber}`), pct: number(f.percent) }),
      })),
    );
  }
  if (data.fiberType) add("fiber", t(`enums.fiber.${data.fiberType}`));
  add(
    "yarn",
    [data.yarnCount, data.yarnProcess && t(`enums.yarnProcess.${data.yarnProcess}`)].filter(Boolean).join(" · "),
  );
  add("origin", [data.originCountry && country(data.originCountry), data.originRegion].filter(Boolean).join(" · "));
  if (data.harvestYear) add("harvest", String(data.harvestYear), true);
  add("fabric", data.fabricType);
  if (data.gsm != null) add("gsm", t("step.gsmValue", { n: number(data.gsm) }), true);
  if (data.dyeProcess) {
    add("dye", data.dyeProcess === "OTHER" && data.dyeProcessOther ? data.dyeProcessOther : t(`enums.dyeProcess.${data.dyeProcess}`));
  }
  if (data.chemicalStandards?.length) {
    add("chemicals", data.chemicalStandards.map((c) => t(`enums.chemicalStandard.${c}`)).join(" · "));
  }
  if (data.waterLPerKg != null) add("water", t("step.waterValue", { n: number(data.waterLPerKg) }), true);
  const energy =
    data.energyKwhPerKg != null
      ? t("step.energyKg", { n: number(data.energyKwhPerKg) })
      : data.energyKwhPerPiece != null
        ? t("step.energyPiece", { n: number(data.energyKwhPerPiece) })
        : undefined;
  const sources = data.energySources ?? [];
  if (energy || sources.length > 0) {
    add(
      "energy",
      energy ?? sources.map((s) => pct(s.percent)).join(" / "),
      true,
      sources.length > 0
        ? sources.map((s, i) => ({
            pct: s.percent,
            kind: SHARE_KINDS[(i + 4) % SHARE_KINDS.length],
            label: t("step.share", { name: t(`enums.energySource.${s.source}`), pct: number(s.percent) }),
          }))
        : undefined,
    );
  }
  add("shade", data.shade);
  const delivered = data.deliveredKg ?? data.quantityKg;
  if (delivered != null) add("delivered", t("step.kg", { n: number(delivered) }), true);
  return rows;
}
