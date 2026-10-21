import { passportUrl, readCode } from "../scan";

describe("readCode", () => {
  it("reads a GS1 Digital Link on any host, the batch upper-cased and the GTIN as 14 digits", () => {
    expect(readCode("https://kozapass.vercel.app/01/08691234567890/10/KP-2026-0915-A")).toEqual({
      kind: "gs1",
      gtin: "08691234567890",
      batchNo: "KP-2026-0915-A",
    });
    expect(readCode(" http://id.example.com/01/8691234567890/10/kp-2026-0915-a?lang=de ")).toEqual({
      kind: "gs1",
      gtin: "08691234567890",
      batchNo: "KP-2026-0915-A",
    });
  });

  it("takes anything else as text that is only shown", () => {
    expect(readCode("https://kampanya.ornekmagaza.com/tr/indirim?ref=qr")).toEqual({
      kind: "other",
      text: "https://kampanya.ornekmagaza.com/tr/indirim?ref=qr",
    });
    // A wrong check digit, a batch number that is not AI (10), and plain text.
    expect(readCode("https://kozapass.vercel.app/01/08691234567891/10/KP-1").kind).toBe("other");
    expect(readCode("https://kozapass.vercel.app/01/08691234567890/10/KP%2F1").kind).toBe("other");
    expect(readCode("KP-2026-0915-A").kind).toBe("other");
  });
});

describe("passportUrl", () => {
  it("is our own public page, whatever host the code named", () => {
    expect(passportUrl("8691234567890", "KP-1")).toBe("https://kozapass.vercel.app/01/08691234567890/10/KP-1");
  });
});
