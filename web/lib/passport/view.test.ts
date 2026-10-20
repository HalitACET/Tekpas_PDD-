import { describe, expect, it } from "vitest";
import type { SnapshotStep } from "./types";
import {
  certificateName,
  certificateState,
  certificatesOfStep,
  energyColor,
  energyMix,
  groupStages,
  hasEnvironmentalData,
  metrics,
} from "./view";

const step = (key: string, type: SnapshotStep["type"], data: SnapshotStep["data"] = {}, over: Partial<SnapshotStep> = {}): SnapshotStep => ({
  key,
  type,
  approved: true,
  approvedAt: "2026-09-20T10:00:00Z",
  inputs: [],
  certificates: [],
  data,
  ...over,
});

describe("groupStages", () => {
  it("makes steps of the same type next to each other one stage (parallel inputs)", () => {
    const stages = groupStages([
      step("s1", "FIBER"),
      step("s2", "YARN"),
      step("s3", "YARN"),
      step("s4", "FABRIC"),
    ]);

    expect(stages.map((s) => [s.type, s.steps.map((x) => x.key)])).toEqual([
      ["FIBER", ["s1"]],
      ["YARN", ["s2", "s3"]],
      ["FABRIC", ["s4"]],
    ]);
  });

  it("is empty for no steps", () => {
    expect(groupStages([])).toEqual([]);
  });
});

describe("certificateState", () => {
  it.each([
    ["2026-10-19", "expired"],
    ["2026-10-20", "expiring"],
    ["2026-11-19", "expiring"],
    ["2026-11-20", "valid"],
    ["2027-03-13", "valid"],
  ])("a certificate ending %s is %s on 2026-10-20", (until, state) => {
    expect(certificateState(until, "2026-10-20")).toBe(state);
  });

  it("counts the thirty days across a month and a year end", () => {
    expect(certificateState("2027-01-19", "2026-12-20")).toBe("expiring");
    expect(certificateState("2027-01-20", "2026-12-20")).toBe("valid");
  });
});

describe("certificatesOfStep", () => {
  it("returns the certificates a step refers to, in its order", () => {
    const certs = [
      { key: "c1", type: "GOTS", validUntil: "2027-01-01" },
      { key: "c2", type: "OEKO_TEX", validUntil: "2027-01-01" },
    ] as never;

    expect(certificatesOfStep(step("s2", "YARN", {}, { certificates: ["c2", "c9", "c1"] }), certs).map((c) => c.key)).toEqual(["c2", "c1"]);
  });
});

describe("energyMix", () => {
  it("averages the declared shares per source, every step the same, largest first", () => {
    const mix = energyMix([
      step("s2", "YARN", { energySources: [{ source: "SOLAR", percent: 70 }, { source: "GRID", percent: 30 }] }),
      step("s3", "FABRIC", { energySources: [{ source: "SOLAR", percent: 60 }, { source: "GRID", percent: 40 }] }),
      step("s4", "DYEING", { energySources: [{ source: "NATURAL_GAS", percent: 100 }] }),
      step("s5", "SEWING", {}),
    ]);

    expect(mix.map((m) => [m.source, Math.round(m.percent)])).toEqual([
      ["SOLAR", 43],
      ["GRID", 23],
      ["NATURAL_GAS", 33],
    ].sort((a, b) => (b[1] as number) - (a[1] as number)));
    expect(mix.reduce((sum, m) => sum + m.percent, 0)).toBeCloseTo(100);
  });

  it("ignores steps that are not approved and is empty without data", () => {
    expect(energyMix([step("s2", "YARN", { energySources: [{ source: "SOLAR", percent: 100 }] }, { approved: false })])).toEqual([]);
    expect(energyMix([step("s1", "FIBER")])).toEqual([]);
  });
});

describe("metrics", () => {
  it("averages the water use and adds the energy per kg of the steps", () => {
    const m = metrics([
      step("s2", "YARN", { energyKwhPerKg: 3.1 }),
      step("s3", "FABRIC", { energyKwhPerKg: 4.2 }),
      step("s4", "DYEING", { waterLPerKg: 60 }),
      step("s5", "DYEING", { waterLPerKg: 80 }),
    ]);

    expect(m.energyKwhPerKg).toBeCloseTo(7.3);
    expect(m.waterLPerKg).toBe(70);
  });

  it("has nothing for steps without figures, and the section is left out", () => {
    const steps = [step("s1", "FIBER"), step("s5", "SEWING", { energyKwhPerPiece: 0.4 })];

    expect(metrics(steps)).toEqual({ waterLPerKg: undefined, energyKwhPerKg: undefined });
    expect(hasEnvironmentalData(steps)).toBe(false);
    expect(hasEnvironmentalData([step("s4", "DYEING", { waterLPerKg: 68 })])).toBe(true);
  });
});

describe("names and colours", () => {
  it("writes the standard's own name and has a colour for every energy source", () => {
    expect(certificateName("OEKO_TEX")).toBe("OEKO-TEX Standard 100");
    expect(certificateName("GOTS")).toBe("GOTS");
    expect(certificateName("NEW_TYPE")).toBe("NEW_TYPE");
    for (const source of ["SOLAR", "WIND", "GRID", "NATURAL_GAS", "COAL", "BIOMASS", "OTHER"]) {
      expect(energyColor(source)).toMatch(/^var\(--/);
    }
  });
});
