import { describe, expect, it } from "vitest";
import { displayGtin, fiberText, formatDateRange, formatPercent, formatQuantity, formatUpdated } from "./format";

const names: Record<string, Record<string, string>> = {
  tr: { ORGANIC_COTTON: "Organik pamuk", ELASTANE: "Elastan", SILK: "İpek" },
  en: { ORGANIC_COTTON: "Organic cotton", ELASTANE: "Elastane", SILK: "Silk" },
  de: { ORGANIC_COTTON: "Bio-Baumwolle", ELASTANE: "Elasthan", SILK: "Seide" },
};

describe("displayGtin", () => {
  it("drops the leading 0 of a GTIN-13 and keeps a real GTIN-14", () => {
    expect(displayGtin("02012345000018")).toBe("2012345000018");
    expect(displayGtin("10012345678902")).toBe("10012345678902");
    expect(displayGtin("00000096385074")).toBe("0000096385074");
  });
});

describe("formatQuantity", () => {
  it("groups thousands per locale", () => {
    expect(formatQuantity(1800, "tr")).toBe("1.800");
    expect(formatQuantity(1800, "en")).toBe("1,800");
    expect(formatQuantity(600, "de")).toBe("600");
  });
});

describe("formatPercent", () => {
  it("follows the locale", () => {
    expect(formatPercent(95, "tr")).toBe("%95");
    expect(formatPercent(95, "en")).toBe("95%");
    expect(formatPercent(95, "de")).toBe("95 %");
  });
});

describe("fiberText", () => {
  const composition = [
    { fiber: "ORGANIC_COTTON", percent: 95 },
    { fiber: "ELASTANE", percent: 5 },
  ] as const;

  it("matches the design in Turkish", () => {
    expect(fiberText(composition, "tr", (f) => names.tr[f])).toBe("%95 organik pamuk · %5 elastan");
  });

  it("lower-cases with Turkish rules and keeps German nouns capitalised", () => {
    expect(fiberText([{ fiber: "SILK", percent: 100 }], "tr", (f) => names.tr[f])).toBe("%100 ipek");
    expect(fiberText(composition, "en", (f) => names.en[f])).toBe("95% organic cotton · 5% elastane");
    expect(fiberText(composition, "de", (f) => names.de[f])).toBe("95 % Bio-Baumwolle · 5 % Elasthan");
  });
});

describe("formatUpdated", () => {
  const now = new Date(2026, 9, 3, 18, 0);

  it("shows the time today, 'yesterday', then day and month", () => {
    expect(formatUpdated(new Date(2026, 9, 3, 14, 32).toISOString(), now, "tr", "Dün")).toBe("14:32");
    expect(formatUpdated(new Date(2026, 9, 2, 23, 59).toISOString(), now, "tr", "Dün")).toBe("Dün");
    expect(formatUpdated(new Date(2026, 8, 12, 9, 0).toISOString(), now, "tr", "Dün")).toBe("12 Eyl");
    expect(formatUpdated(new Date(2026, 7, 28, 9, 0).toISOString(), now, "tr", "Dün")).toBe("28 Ağu");
  });

  it("adds the year for earlier years", () => {
    expect(formatUpdated(new Date(2025, 11, 30).toISOString(), now, "tr", "Dün")).toBe("30 Ara 2025");
  });

  it("uses the locale's month names", () => {
    expect(formatUpdated(new Date(2026, 8, 12).toISOString(), now, "en", "Yesterday")).toBe("Sep 12");
    expect(formatUpdated(new Date(2026, 8, 12).toISOString(), now, "de", "Gestern")).toBe("12. Sept");
  });
});

describe("formatDateRange", () => {
  it("writes the year once within one year (09), both years otherwise", () => {
    expect(formatDateRange("2026-09-02", "2026-09-20", "tr")).toBe("02.09 – 20.09.2026");
    expect(formatDateRange("2026-12-28", "2027-01-08", "tr")).toBe("28.12.2026 – 08.01.2027");
    expect(formatDateRange("2026-09-02", "2026-09-20", "de")).toBe("02.09 – 20.09.2026");
    expect(formatDateRange("2026-09-02", "2026-09-20", "en")).toBe("09/02 – 09/20/2026");
  });

  it("shows the one known end, or nothing", () => {
    expect(formatDateRange("2026-09-02", null, "tr")).toBe("02.09.2026");
    expect(formatDateRange(undefined, "2026-09-20", "tr")).toBe("20.09.2026");
    expect(formatDateRange(null, null, "tr")).toBe("");
  });
});
