import { BATCH_STATUSES, FIBERS, FIELD_ERROR_CODES, PRODUCT_CATEGORIES } from "@tekpas/shared";
import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

/** Every key path, with array lengths, so a missing or extra entry in one language fails. */
function shape(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return [`${prefix}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${prefix}[${i}]`))];
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe("messages", () => {
  it("en has exactly the keys of tr", () => {
    expect(shape(en).sort()).toEqual(shape(tr).sort());
  });

  it("de has exactly the keys of tr", () => {
    expect(shape(de).sort()).toEqual(shape(tr).sort());
  });

  it("has no empty strings except the design's blank settings columns", () => {
    for (const messages of [tr, en, de]) {
      const empty = shape(messages).filter((path) => {
        const v = path.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], messages);
        return v === "";
      });
      expect(empty.every((path) => path.startsWith("pages.settings.cols["))).toBe(true);
    }
  });

  it("translates every API enum value and field error code", () => {
    const keys = new Set(shape(tr));
    const expected = [
      ...FIBERS.map((f) => `enums.fiber.${f}`),
      ...PRODUCT_CATEGORIES.map((c) => `enums.productCategory.${c}`),
      ...BATCH_STATUSES.map((s) => `enums.batchStatus.${s}`),
      ...FIELD_ERROR_CODES.map((c) => `errors.field.${c}`),
    ];
    expect(expected.filter((key) => !keys.has(key))).toEqual([]);
  });
});
