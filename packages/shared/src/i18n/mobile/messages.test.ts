import { describe, expect, it } from "vitest";
import { mobileMessages } from "./index";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("mobile messages", () => {
  it("have the same keys in every language", () => {
    const tr = keys(mobileMessages.tr).sort();
    expect(keys(mobileMessages.en).sort()).toEqual(tr);
    expect(keys(mobileMessages.de).sort()).toEqual(tr);
  });

  it("use the same placeholders in every language", () => {
    const placeholders = (lang: keyof typeof mobileMessages) =>
      Object.fromEntries(
        keys(mobileMessages[lang]).map((k) => {
          const text = k.split(".").reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], mobileMessages[lang]);
          return [k, [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()];
        }),
      );
    expect(placeholders("en")).toEqual(placeholders("tr"));
    expect(placeholders("de")).toEqual(placeholders("tr"));
  });
});
