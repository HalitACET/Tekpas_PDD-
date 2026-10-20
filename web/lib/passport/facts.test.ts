import { describe, expect, it } from "vitest";
import { type FactText, factsOf } from "./facts";
import type { SnapshotStep } from "./types";

const text: FactText = {
  fiber: (f) => (f === "ORGANIC_COTTON" ? "Organik pamuk" : "Elastan"),
  energySource: (s) => (s === "SOLAR" ? "GES" : "Şebeke"),
  yarnProcess: () => "Penye",
  dyeProcess: () => "Reaktif",
  chemicalStandard: (c) => (c === "ZDHC_MRSL" ? "ZDHC MRSL" : "GOTS onaylı"),
  country: (code) => (code === "TR" ? "Türkiye" : code),
  unit: (unit, value) => ({ kwhPerKg: `${value} kWh/kg`, kwhPerPiece: `${value} kWh/adet`, lPerKg: `${value} L/kg`, gsm: `${value} g/m²` })[unit],
  labels: {
    origin: "Menşe ülke",
    yarn: "İplik",
    fabric: "Kumaş yapısı",
    composition: "Lif bileşimi",
    dye: "Boya işlemi",
    chemical: "Kimyasal standart",
    energySource: "Enerji kaynağı",
    energyUse: "Enerji tüketimi",
    water: "Su tüketimi",
  },
};

const step = (type: SnapshotStep["type"], data: SnapshotStep["data"]): SnapshotStep => ({
  key: "s1",
  type,
  approved: true,
  inputs: [],
  certificates: [],
  data,
});

const rows = (s: SnapshotStep) => factsOf(s, "tr", text).map((f) => [f.label, f.value]);

describe("factsOf", () => {
  it("fibre: where it is from", () => {
    expect(rows(step("FIBER", { fiberType: "ORGANIC_COTTON", originCountry: "TR", originRegion: "Şanlıurfa" }))).toEqual([
      ["Menşe ülke", "Türkiye · Şanlıurfa"],
    ]);
  });

  it("yarn: count and process, composition, origin, energy, in that order", () => {
    expect(
      rows(
        step("YARN", {
          yarnCount: "Ne 30/1",
          yarnProcess: "COMBED",
          fiberComposition: [{ fiber: "ORGANIC_COTTON", percent: 100 }],
          originCountry: "TR",
          energySources: [{ source: "SOLAR", percent: 70 }, { source: "GRID", percent: 30 }],
          energyKwhPerKg: 3.1,
        }),
      ),
    ).toEqual([
      ["İplik", "Ne 30/1 Penye"],
      ["Lif bileşimi", "%100 organik pamuk"],
      ["Menşe ülke", "Türkiye"],
      ["Enerji kaynağı", "GES %70 · Şebeke %30"],
      ["Enerji tüketimi", "3,1 kWh/kg"],
    ]);
  });

  it("fabric: structure with the weight", () => {
    expect(rows(step("FABRIC", { fabricType: "Süprem", gsm: 180 }))).toEqual([["Kumaş yapısı", "Süprem · 180 g/m²"]]);
  });

  it("dyeing: the process (or the free text for OTHER), standards, energy and water", () => {
    expect(rows(step("DYEING", { dyeProcess: "REACTIVE", chemicalStandards: ["ZDHC_MRSL", "GOTS_APPROVED"], waterLPerKg: 68 }))).toEqual([
      ["Boya işlemi", "Reaktif"],
      ["Kimyasal standart", "ZDHC MRSL · GOTS onaylı"],
      ["Su tüketimi", "68 L/kg"],
    ]);
    expect(rows(step("DYEING", { dyeProcess: "OTHER", dyeProcessOther: "Batik" }))).toEqual([["Boya işlemi", "Batik"]]);
  });

  it("sewing: energy is per piece", () => {
    expect(rows(step("SEWING", { originCountry: "TR", energyKwhPerPiece: 0.4 }))).toEqual([
      ["Menşe ülke", "Türkiye"],
      ["Enerji tüketimi", "0,4 kWh/adet"],
    ]);
  });

  it("has no row for what is not known, and none at all for a step without data", () => {
    expect(rows(step("YARN", {}))).toEqual([]);
    expect(factsOf({ ...step("YARN", {}), data: undefined }, "tr", text)).toEqual([]);
  });
});
