import { describe, expect, it } from "vitest";
import {
  emptyValues,
  errorGroup,
  formPathOf,
  parseDecimal,
  parsePercent,
  type SubmissionValues,
  submissionSchema,
  toStepData,
  valuesFrom,
} from "./form";

function codes(values: SubmissionValues, type: Parameters<typeof submissionSchema>[0]): Record<string, string> {
  const result = submissionSchema(type).safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

const yarn: SubmissionValues = {
  ...emptyValues(),
  fibers: [
    { fiber: "COTTON", percent: "80" },
    { fiber: "POLYESTER", percent: "20" },
  ],
  originCountry: "TR",
  submitterName: "Ahmet Kaya",
};

describe("parseDecimal", () => {
  it.each([
    ["3,4", 3.4],
    ["1.150", 1150],
    ["1.150,5", 1150.5],
    ["62.5", 62.5],
    ["0.500", 0.5],
    ["640", 640],
  ])("%j → %d", (text, number) => {
    expect(parseDecimal(text)).toBe(number);
  });

  it("returns undefined for empty text and NaN for the rest", () => {
    expect(parseDecimal("  ")).toBeUndefined();
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("-3")).toBeNaN();
  });

  it("reads whole percents only", () => {
    expect(parsePercent("80")).toBe(80);
    expect(parsePercent("")).toBeUndefined();
    expect(parsePercent("80,5")).toBeNaN();
  });
});

describe("submissionSchema", () => {
  it("accepts a filled yarn form without energy, yarn count or spinning", () => {
    expect(codes(yarn, "YARN")).toEqual({});
  });

  it("asks for the fibre shares to add up to 100, and for the origin and the sender", () => {
    const wrong = { ...yarn, fibers: [{ fiber: "COTTON" as const, percent: "80" }, { fiber: "POLYESTER" as const, percent: "15" }] };
    expect(codes({ ...wrong, originCountry: "", submitterName: "" }, "YARN")).toEqual({
      fibersGroup: "FiberTotal",
      originCountry: "OriginRequired",
      submitterName: "NameRequired",
    });
    expect(codes({ ...yarn, submitterName: "Al" }, "YARN")).toEqual({ submitterName: "NameShort" });
  });

  it("flags empty, fractional and duplicate fibre lines", () => {
    const rows = [{ fiber: "COTTON" as const, percent: "" }, { fiber: "COTTON" as const, percent: "10,5" }];
    expect(codes({ ...yarn, fibers: rows }, "YARN")).toEqual({
      "fibers.0.percent": "NotNull",
      "fibers.1.percent": "Integer",
      fibersGroup: "FiberDuplicate",
    });
  });

  it("checks the energy mix only when one was started, and the yarn count's shape", () => {
    expect(codes({ ...yarn, energy: [{ source: "GRID", percent: "60" }], yarnCount: "30" }, "YARN")).toEqual({
      energyGroup: "EnergyTotal",
      yarnCount: "YarnCount",
    });
    expect(codes({ ...yarn, yarnCount: "30/1", energyKwhPerKg: "0" }, "YARN")).toEqual({ energyKwhPerKg: "Positive" });
  });

  it("needs a fabric type for fabric, and the dyeing process and standards for dyeing", () => {
    expect(codes({ ...yarn, submitterName: "Selin Arslan", originCountry: "" }, "FABRIC")).toEqual({ fabricType: "FabricType" });
    const dye = { ...emptyValues(), submitterName: "Kerem Çınar" };
    expect(codes(dye, "DYEING")).toEqual({ dyeProcess: "DyeProcess", chemicalStandards: "Chemicals" });
    expect(codes({ ...dye, dyeProcess: "OTHER", chemicalStandards: ["NONE", "BLUESIGN"] }, "DYEING")).toEqual({
      dyeProcessOther: "DyeProcessOther",
      chemicalStandards: "NoneExclusive",
    });
    expect(codes({ ...dye, dyeProcess: "REACTIVE", chemicalStandards: ["NONE"] }, "DYEING")).toEqual({});
  });

  it("needs the origin country for sewing only", () => {
    const sewing = { ...emptyValues(), submitterName: "Gül Aydın" };
    expect(codes(sewing, "SEWING")).toEqual({ originCountry: "OriginRequired" });
    expect(codes(sewing, "ACCESSORY")).toEqual({});
  });
});

describe("toStepData", () => {
  it("sends the fields of the yarn sections that were filled", () => {
    const values: SubmissionValues = {
      ...yarn,
      energy: [
        { source: "GRID", percent: "60" },
        { source: "SOLAR", percent: "40" },
      ],
      energyKwhPerKg: "3,4",
      deliveredKg: "1.150",
      yarnCount: "30/1",
      yarnProcess: "CARDED",
      shade: "stays out",
    };
    expect(toStepData(values, "YARN")).toEqual({
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
      deliveredKg: 1150,
      yarnCount: "Ne 30/1",
      yarnProcess: "CARDED",
    });
  });

  it("leaves out an energy mix nobody typed, and the other process text unless it is the process", () => {
    expect(toStepData(yarn, "YARN").energySources).toBeUndefined();
    const dye: SubmissionValues = { ...emptyValues(), dyeProcess: "VAT", dyeProcessOther: "x", chemicalStandards: ["NONE"], waterLPerKg: "62" };
    expect(toStepData(dye, "DYEING")).toEqual({ dyeProcess: "VAT", chemicalStandards: ["NONE"], waterLPerKg: 62 });
  });
});

describe("valuesFrom", () => {
  it("fills the form with the previous submission (design 45)", () => {
    const values = valuesFrom({
      fiberComposition: [{ fiber: "COTTON", percent: 80 }],
      originCountry: "TR",
      energyKwhPerKg: 3.4,
      yarnCount: "Ne 30/1",
    });
    expect(values).toMatchObject({
      fibers: [{ fiber: "COTTON", percent: "80" }],
      originCountry: "TR",
      energyKwhPerKg: "3,4",
      yarnCount: "30/1",
      submitterName: "",
      submitterRole: "",
    });
  });

  it("starts a correction with the sender of the data being corrected (M10 T2)", () => {
    const values = valuesFrom({ originCountry: "TR" }, { submitterName: "Ahmet Kaya", submitterRole: "Kalite sorumlusu" });
    expect(values).toMatchObject({ originCountry: "TR", submitterName: "Ahmet Kaya", submitterRole: "Kalite sorumlusu" });
    expect(valuesFrom(undefined, { submitterName: "Ahmet Kaya", submitterRole: null })).toMatchObject({
      submitterName: "Ahmet Kaya",
      submitterRole: "",
    });
  });
});

describe("formPathOf", () => {
  it("maps API field names to the form's", () => {
    expect(formPathOf("data.fiberComposition[1].percent")).toBe("fibers.1.percent");
    expect(formPathOf("data.fiberComposition")).toBe("fibersGroup");
    expect(formPathOf("data.energySources")).toBe("energyGroup");
    expect(formPathOf("data.dyeProcessOther")).toBe("dyeProcessOther");
    expect(formPathOf("submitterName")).toBe("submitterName");
    expect(formPathOf("unknown")).toBeUndefined();
    expect(errorGroup("fibersGroup")).toBe("fibers");
  });
});
