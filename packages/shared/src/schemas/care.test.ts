import { describe, expect, it } from "vitest";
import { CARE_SYMBOLS, careInfoSchema, gentlenessOptions, isCareEmpty } from "./care";

function codes(input: unknown): string[] {
  const result = careInfoSchema.safeParse(input);
  return (result.error?.issues ?? []).map((i) => `${i.path.join(".")}:${i.message}`).sort();
}

describe("careInfoSchema", () => {
  it("accepts a full label, fills in missing bars and the note's language, trims the note", () => {
    const care = careInfoSchema.parse({
      washing: { symbol: "WASH_40", gentleness: "GENTLE" },
      bleaching: { symbol: "DO_NOT_BLEACH" },
      note: "  Ters çevirerek yıkayın. ",
    });

    expect(care).toEqual({
      washing: { symbol: "WASH_40", gentleness: "GENTLE" },
      bleaching: { symbol: "DO_NOT_BLEACH", gentleness: "NORMAL" },
      drying: null,
      ironing: null,
      professional: null,
      note: "Ters çevirerek yıkayın.",
      noteLanguage: "tr",
    });
    expect(careInfoSchema.parse({ note: "Gently", noteLanguage: "en" }).noteLanguage).toBe("en");
    expect(careInfoSchema.parse({ note: " ", noteLanguage: "en" })).toMatchObject({ note: null, noteLanguage: null });
  });

  it("reports the API's field codes", () => {
    expect(codes({ washing: { symbol: "IRON_LOW" } })).toEqual(["washing:CareSymbolIn"]);
    expect(codes({ washing: { symbol: "DO_NOT_WASH", gentleness: "GENTLE" } })).toEqual(["washing:CareGentleness"]);
    expect(codes({ professional: { symbol: "WET_CLEAN", gentleness: "VERY_GENTLE" } })).toEqual([
      "professional:CareGentleness",
    ]);
    expect(codes({ note: "a".repeat(201) })).toEqual(["note:Size"]);
    expect(codes({ note: "x", noteLanguage: "es" })).toEqual(["noteLanguage:Pattern"]);
  });
});

describe("care helpers", () => {
  it("offers bars only where the symbol takes them", () => {
    expect(gentlenessOptions("WASH_30")).toEqual(["NORMAL", "GENTLE", "VERY_GENTLE"]);
    expect(gentlenessOptions("DRY_CLEAN_P")).toEqual(["NORMAL", "GENTLE"]);
    expect(gentlenessOptions("HAND_WASH")).toEqual(["NORMAL"]);
    expect(CARE_SYMBOLS).toHaveLength(23);
  });

  it("an empty label is none", () => {
    expect(isCareEmpty(careInfoSchema.parse({ note: "  " }))).toBe(true);
    expect(isCareEmpty(careInfoSchema.parse({ ironing: { symbol: "DO_NOT_IRON" } }))).toBe(false);
    expect(isCareEmpty(null)).toBe(true);
  });
});
