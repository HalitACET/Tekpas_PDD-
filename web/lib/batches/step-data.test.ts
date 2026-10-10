import { describe, expect, it } from "vitest";
import { stepDataRows, type StepDataText } from "./step-data";

const text: StepDataText = {
  fiber: (f) => ({ COTTON: "Pamuk", POLYESTER: "Polyester", ORGANIC_COTTON: "Organik pamuk" })[f as string] ?? f,
  energySource: (s) => ({ GRID: "Şebeke", SOLAR: "GES" })[s as string] ?? s,
  yarnProcess: (p) => ({ CARDED: "karde" })[p as string] ?? p,
  country: (c) => (c === "TR" ? "Türkiye" : c),
  unit: (unit, value) => `${value} ${{ kg: "kg", kwhPerKg: "kWh/kg", kwhPerPiece: "kWh/adet", lPerKg: "L/kg", gsm: "g/m²" }[unit]}`,
};

describe("stepDataRows", () => {
  it("shows a yarn step as in design 10", () => {
    const rows = stepDataRows(
      "YARN",
      {
        fiberComposition: [
          { fiber: "COTTON", percent: 80 },
          { fiber: "POLYESTER", percent: 20 },
        ],
        originCountry: "TR",
        energySources: [
          { source: "GRID", percent: 60 },
          { source: "SOLAR", percent: 40 },
        ],
        energyKwhPerKg: 3.4,
        deliveredKg: 640,
        yarnCount: "Ne 30/1",
        yarnProcess: "CARDED",
      },
      "tr",
      text,
    );

    expect(rows).toEqual([
      { field: "fiberComposition", value: "%80 pamuk · %20 polyester" },
      { field: "originCountry", value: "Türkiye" },
      { field: "energySources", value: "Şebeke %60 · GES %40" },
      { field: "energyUse", value: "3,4 kWh/kg" },
      { field: "delivered", value: "640 kg · Ne 30/1 karde" },
    ]);
  });

  it("lists the fields of the step type even when nothing was entered yet", () => {
    expect(stepDataRows("DYEING", {}, "tr", text)).toEqual([
      { field: "process", value: null },
      { field: "chemicalCompliance", value: null },
      { field: "energySources", value: null },
      { field: "energyUse", value: null },
      { field: "waterLPerKg", value: null },
    ]);
  });

  it("uses the per-piece energy for sewing and the origin fields for fibre", () => {
    expect(stepDataRows("SEWING", { energyKwhPerPiece: 0.25 }, "tr", text)[2]).toEqual({
      field: "energyUse",
      value: "0,25 kWh/adet",
    });
    expect(
      stepDataRows("FIBER", { fiberType: "ORGANIC_COTTON", originRegion: "Harran, Şanlıurfa", harvestYear: 2025 }, "tr", text),
    ).toEqual([
      { field: "fiberType", value: "Organik pamuk" },
      { field: "originRegion", value: "Harran, Şanlıurfa" },
      { field: "originCountry", value: null },
      { field: "harvestYear", value: "2025" },
      { field: "quantityKg", value: null },
    ]);
  });
});
