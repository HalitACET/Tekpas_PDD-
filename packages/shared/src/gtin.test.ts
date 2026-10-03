import { describe, expect, it } from "vitest";
import vectors from "../test-vectors/gtin.json";
import { gtinCheckDigit, hasAcceptedGtinFormat, hasValidGtinCheckDigit, normalizeGtin } from "./gtin";
import { gtinSchema } from "./schemas/product";

/** Every variant with exactly one digit replaced by another digit. */
function singleDigitChanges(gtin: string): string[] {
  return [...gtin].flatMap((char, i) =>
    Array.from({ length: 9 }, (_, d) => gtin.slice(0, i) + ((Number(char) + d + 1) % 10) + gtin.slice(i + 1)),
  );
}

// Same cases as the backend's GtinTest.
describe("GTIN (test-vectors/gtin.json)", () => {
  it.each(vectors.valid)("$input ($note) passes and normalizes to 14 digits", ({ input, normalized }) => {
    expect(hasAcceptedGtinFormat(input)).toBe(true);
    expect(hasValidGtinCheckDigit(input)).toBe(true);
    expect(normalizeGtin(input)).toBe(normalized);
    expect(gtinSchema.parse(input)).toBe(normalized);
  });

  it.each(vectors.valid)("$input with any single digit changed fails the check digit", ({ input }) => {
    for (const changed of singleDigitChanges(input)) {
      expect(hasValidGtinCheckDigit(changed), changed).toBe(false);
    }
  });

  it.each(vectors.invalidCheckDigit)("%s has a wrong check digit", (input) => {
    expect(hasAcceptedGtinFormat(input)).toBe(true);
    expect(hasValidGtinCheckDigit(input)).toBe(false);
    const result = gtinSchema.safeParse(input);
    expect(result.error?.issues.map((i) => i.message)).toEqual(["GtinCheckDigit"]);
  });

  it.each(vectors.invalidFormat)("%j is not a GTIN", (input) => {
    expect(hasAcceptedGtinFormat(input)).toBe(false);
    expect(() => normalizeGtin(input)).toThrow();
    const result = gtinSchema.safeParse(input);
    expect(result.error?.issues.map((i) => i.message)).toEqual(["GtinFormat"]);
  });

  it("computes known check digits", () => {
    expect(gtinCheckDigit("400638133393")).toBe(1);
    expect(gtinCheckDigit("0201234500001")).toBe(8);
    expect(gtinCheckDigit("9638507")).toBe(4);
  });
});
