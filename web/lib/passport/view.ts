import type { SnapshotCertificate, SnapshotStep } from "./types";

/*
 * What the passport page derives from the snapshot (design v0.6 KozaPassPasaport): the chain grouped into stages, the
 * certificate states, the energy mix and the environmental figures. Pure functions, no React: tested on their own.
 */

export interface Stage {
  type: SnapshotStep["type"];
  steps: SnapshotStep[];
}

/** Steps of the same type next to each other are one stage ("2 iplik" in the design): they run in parallel. */
export function groupStages(steps: SnapshotStep[]): Stage[] {
  const stages: Stage[] = [];
  for (const step of steps) {
    const last = stages.at(-1);
    if (last && last.type === step.type) last.steps.push(step);
    else stages.push({ type: step.type, steps: [step] });
  }
  return stages;
}

/** The stage after this one in the chain, whose step the parallel inputs merge into; undefined for the last one. */
export function nextStage(stages: Stage[], index: number): Stage | undefined {
  return stages[index + 1];
}

export type CertificateState = "valid" | "expiring" | "expired";

const EXPIRING_DAYS = 30;

/** Dates are ISO days; a certificate is valid through its last day, and "expiring" within 30 days (design 13). */
export function certificateState(validUntil: string, today: string): CertificateState {
  if (validUntil < today) return "expired";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + EXPIRING_DAYS);
  return validUntil <= limit.toISOString().slice(0, 10) ? "expiring" : "valid";
}

export function certificatesOfStep(step: SnapshotStep, all: SnapshotCertificate[]): SnapshotCertificate[] {
  return step.certificates.map((key) => all.find((c) => c.key === key)).filter((c): c is SnapshotCertificate => !!c);
}

export interface EnergyShare {
  source: string;
  percent: number;
}

/**
 * The energy mix of the whole chain: each step that declares one counts the same, the shares are averaged per source
 * (so every step's own 100 % stays 100 % in total). Largest first.
 */
export function energyMix(steps: SnapshotStep[]): EnergyShare[] {
  const declared = steps.filter((s) => s.approved && s.data?.energySources?.length);
  if (declared.length === 0) return [];
  const sums = new Map<string, number>();
  for (const step of declared) {
    for (const share of step.data!.energySources!) {
      sums.set(share.source, (sums.get(share.source) ?? 0) + share.percent);
    }
  }
  return [...sums.entries()]
    .map(([source, total]) => ({ source, percent: total / declared.length }))
    .sort((a, b) => b.percent - a.percent);
}

export interface Metrics {
  /** L/kg: the average of the steps that declare it (dyeing). */
  waterLPerKg?: number;
  /** kWh/kg: the declared values of the steps added up (each is per kg of that step's output). */
  energyKwhPerKg?: number;
}

export function metrics(steps: SnapshotStep[]): Metrics {
  const approved = steps.filter((s) => s.approved && s.data);
  const water = approved.map((s) => s.data!.waterLPerKg).filter((v): v is number => v != null);
  const energy = approved.map((s) => s.data!.energyKwhPerKg).filter((v): v is number => v != null);
  return {
    waterLPerKg: water.length ? water.reduce((a, b) => a + b, 0) / water.length : undefined,
    energyKwhPerKg: energy.length ? energy.reduce((a, b) => a + b, 0) : undefined,
  };
}

/** Whether there is anything to show in the sustainability section; without data it is left out once published. */
export function hasEnvironmentalData(steps: SnapshotStep[]): boolean {
  const m = metrics(steps);
  return energyMix(steps).length > 0 || m.waterLPerKg != null || m.energyKwhPerKg != null;
}

const CERT_NAMES: Record<string, string> = {
  OEKO_TEX: "OEKO-TEX Standard 100",
  GOTS: "GOTS",
  GRS: "GRS",
  BCI: "BCI",
  OCS: "OCS",
  BLUESIGN: "bluesign",
};

/** The standard's own name (a brand, not a translated word). */
export function certificateName(type: string): string {
  return CERT_NAMES[type] ?? type;
}

/** Colour of an energy source's segment: tokens of the design, a neutral for what has no colour of its own. */
export const ENERGY_COLORS: Record<string, string> = {
  SOLAR: "var(--status-approved)",
  WIND: "var(--status-submitted)",
  GRID: "var(--status-pending)",
  NATURAL_GAS: "var(--story-line)",
  BIOMASS: "var(--brand)",
  COAL: "var(--status-rejected)",
  OTHER: "var(--muted-foreground)",
};

export function energyColor(source: string): string {
  return ENERGY_COLORS[source] ?? "var(--muted-foreground)";
}

/** Fibre segment colours: the first is the brand colour, the rest the neutral line (design: 95/5 organic cotton/elastane). */
export function fiberColor(index: number): string {
  return index === 0 ? "var(--brand)" : index === 1 ? "var(--story-line)" : "var(--muted-foreground)";
}
