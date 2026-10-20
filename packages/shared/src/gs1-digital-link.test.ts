import { describe, expect, it } from "vitest";
import vectors from "../test-vectors/gs1-digital-link.json";
import { digitalLinkPath, digitalLinkUrl, parseDigitalLink } from "./gs1-digital-link";

// Same cases as the backend's Gs1DigitalLinkTest.
describe("GS1 Digital Link (test-vectors/gs1-digital-link.json)", () => {
  it.each(vectors.valid)("$gtin / $batchNo ($note) builds $path", ({ gtin, batchNo, path }) => {
    expect(digitalLinkPath(gtin, batchNo)).toBe(path);
    expect(digitalLinkUrl("https://kozapass.vercel.app/", gtin, batchNo)).toBe(`https://kozapass.vercel.app${path}`);
  });

  it.each(vectors.invalidPath)("$gtin / $batchNo ($note) is refused", ({ gtin, batchNo }) => {
    expect(() => digitalLinkPath(gtin, batchNo)).toThrow();
  });

  it.each(vectors.parse)("$gtin / $batchNo ($note) resolves", ({ gtin, batchNo, gtin14, batch }) => {
    expect(parseDigitalLink(gtin, batchNo)).toEqual({ gtin: gtin14, batchNo: batch });
  });

  it.each(vectors.unreadable)("$gtin / $batchNo ($note) is not a code", ({ gtin, batchNo }) => {
    expect(parseDigitalLink(gtin, batchNo)).toBeUndefined();
  });
});
