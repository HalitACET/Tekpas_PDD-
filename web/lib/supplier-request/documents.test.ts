import { describe, expect, it } from "vitest";
import { canRetry, countedRows, type DocRow, extOf, isFull, MAX_LINK_DOCUMENTS, precheckDocument } from "./documents";

const row = (over: Partial<DocRow> = {}): DocRow => ({
  id: crypto.randomUUID(),
  name: "gots.pdf",
  sizeBytes: 1000,
  state: "done",
  percent: 100,
  ...over,
});

describe("precheckDocument", () => {
  it("lets a PDF, JPG or PNG within 10 MB through", () => {
    for (const name of ["a.pdf", "b.JPG", "c.jpeg", "d.PNG"]) expect(precheckDocument({ name, size: 5000 }, [])).toBeUndefined();
  });

  it("turns away other formats, large and empty files", () => {
    expect(precheckDocument({ name: "teknik_foy.docx", size: 300 }, [])).toBe("format");
    expect(precheckDocument({ name: "tarama.pdf", size: 10 * 1024 * 1024 + 1 }, [])).toBe("size");
    expect(precheckDocument({ name: "bos.pdf", size: 0 }, [])).toBe("empty");
  });

  it("recognises the same file twice (name and size), but not the same name with another size", () => {
    expect(precheckDocument({ name: "gots.pdf", size: 1000 }, [row()])).toBe("duplicate");
    expect(precheckDocument({ name: "gots.pdf", size: 2000 }, [row()])).toBeUndefined();
  });

  it("ignores a failed row when it looks for a duplicate and when it counts", () => {
    expect(precheckDocument({ name: "gots.pdf", size: 1000 }, [row({ state: "failed", error: "format" })])).toBeUndefined();
  });

  it("stops at the limit, counting waiting and uploading rows", () => {
    const full = Array.from({ length: MAX_LINK_DOCUMENTS }, (_, i) => row({ name: `d${i}.pdf`, state: i < 2 ? "queued" : "done" }));
    expect(isFull(full)).toBe(true);
    expect(precheckDocument({ name: "yeni.pdf", size: 10 }, full)).toBe("limit");
    expect(countedRows([...full, row({ state: "failed", error: "limit" })])).toHaveLength(MAX_LINK_DOCUMENTS);
  });
});

describe("canRetry", () => {
  it("offers it for what may work later and only while the file is at hand", () => {
    const file = new File(["x"], "a.pdf");
    expect(canRetry(row({ state: "failed", error: "rate", file }))).toBe(true);
    expect(canRetry(row({ state: "failed", error: "network", file }))).toBe(true);
    expect(canRetry(row({ state: "failed", error: "encrypted", file }))).toBe(false);
    expect(canRetry(row({ state: "failed", error: "rate" }))).toBe(false);
    expect(canRetry(row({ state: "done", file }))).toBe(false);
  });
});

describe("extOf", () => {
  it("names the tile", () => {
    expect(extOf("a.jpeg")).toBe("JPG");
    expect(extOf("b.pdf")).toBe("PDF");
  });
});
