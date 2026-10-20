import { vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PassportSnapshot } from "@/lib/passport/types";
import { renderWithIntl } from "@/test/render";
import { PassportFrame } from "./passport-frame";
import { PassportMissing } from "./passport-states";
import { PassportView } from "./passport-view";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const snapshot: PassportSnapshot = {
  schemaVersion: 1,
  passport: { version: 2, publishedAt: "2026-10-28T09:12:00Z", gtin: "02012345000025", batchNo: "KP-2026-0915-A" },
  manufacturer: { name: "Nilüfer Giyim A.Ş.", city: "Bursa", country: "TR" },
  product: {
    name: "Organik Pamuk Polo",
    category: "T_SHIRT",
    fiberComposition: [
      { fiber: "ORGANIC_COTTON", percent: 95 },
      { fiber: "ELASTANE", percent: 5 },
    ],
  },
  batch: {},
  supplyChain: [
    { key: "s1", type: "FIBER", approved: true, approvedAt: "2026-09-14T10:00:00Z", inputs: [], certificates: [], data: { fiberType: "ORGANIC_COTTON", originCountry: "TR", originRegion: "Şanlıurfa" } },
    {
      key: "s2",
      type: "YARN",
      approved: true,
      approvedAt: "2026-09-16T10:00:00Z",
      inputs: ["s1"],
      actor: { name: "Ege İplik", city: "Denizli", country: "TR" },
      certificates: ["c1"],
      data: { yarnCount: "Ne 30/1", yarnProcess: "COMBED", energySources: [{ source: "SOLAR", percent: 70 }, { source: "GRID", percent: 30 }] },
    },
    {
      key: "s3",
      type: "FABRIC",
      approved: true,
      approvedAt: "2026-09-18T10:00:00Z",
      inputs: ["s2"],
      actor: { name: "Demirtaş Örme Kumaş", city: "Bursa", country: "TR" },
      certificates: ["c2"],
      data: { fabricType: "Süprem", gsm: 180 },
    },
    {
      key: "s4",
      type: "DYEING",
      approved: true,
      approvedAt: "2026-09-19T10:00:00Z",
      inputs: ["s3"],
      actor: { name: "Uludağ Boya Terbiye", city: "Bursa", country: "TR" },
      certificates: [],
      data: { dyeProcess: "REACTIVE", chemicalStandards: ["ZDHC_MRSL"], waterLPerKg: 68 },
    },
  ],
  certificates: [
    { key: "c1", type: "GOTS", certNo: "CU 1047561-GOTS-2026", holder: "Ege İplik", issuer: "Control Union", validFrom: "2026-03-14", validUntil: "2027-03-13" },
    { key: "c2", type: "OEKO_TEX", certNo: "21.HTR.40817", holder: "Demirtaş Örme Kumaş", issuer: "Hohenstein", validFrom: "2025-11-06", validUntil: "2026-11-05" },
  ],
};

function show(over: Partial<React.ComponentProps<typeof PassportView>> = {}) {
  return renderWithIntl(
    <PassportFrame footerHost="kozapass.vercel.app">
      <PassportView snapshot={snapshot} mode="published" verificationCode="7Q4K-2M9X" today="2026-10-20" host="kozapass.vercel.app" {...over} />
    </PassportFrame>,
  );
}

describe("PassportView, published", () => {
  it("shows the product, the identifiers, the verified chip and the fibre composition", () => {
    show();

    expect(screen.getByRole("heading", { level: 1, name: "Organik Pamuk Polo" })).toBeInTheDocument();
    expect(screen.getByText("Tişört")).toBeInTheDocument();
    // Once under the title and once in the QR verification list.
    expect(screen.getAllByText("(01) 02012345000025 · (10) KP-2026-0915-A")).toHaveLength(2);
    expect(screen.getByText(/Doğrulanmış pasaport · Sürüm 2 · 28 Eki 2026/)).toBeInTheDocument();
    const fiber = screen.getByRole("region", { name: "Kumaş ve malzeme bileşimi" });
    expect(within(fiber).getByText("%95")).toBeInTheDocument();
    expect(within(fiber).getByText("%5")).toBeInTheDocument();
    expect(within(fiber).getByText("Süprem · 180 g/m²")).toBeInTheDocument();
  });

  it("lists the stages as buttons that open, the first one open, ending with the product", async () => {
    show();
    const chain = screen.getByRole("region", { name: "İzlenebilirlik" });

    const buttons = within(chain).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    expect(buttons[1]).toHaveAttribute("aria-expanded", "false");
    expect(within(chain).getByText("Türkiye · Şanlıurfa")).toBeInTheDocument();
    expect(within(chain).getByText("Onaylandı · 14 Eyl")).toBeInTheDocument();
    expect(within(chain).getByText("Ürün: Organik Pamuk Polo")).toBeInTheDocument();
    // A closed card says who and where.
    expect(within(chain).getByText("Denizli · TR")).toBeInTheDocument();
    const user = (await import("@testing-library/user-event")).default.setup();
    await user.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute("aria-expanded", "true");
    expect(within(chain).getByText(/Ne 30\/1/)).toBeInTheDocument();
    expect(within(chain).getByText("GOTS")).toBeInTheDocument();
  });

  it("shows each certificate with its state worked out against today", () => {
    show();
    const certs = screen.getByRole("region", { name: "Sertifikalar" });

    expect(within(certs).getByText("CU 1047561-GOTS-2026")).toBeInTheDocument();
    expect(within(certs).getByText("Geçerli")).toBeInTheDocument();
    expect(within(certs).getByText("30 gün içinde doluyor")).toBeInTheDocument();
    expect(within(certs).getByText("Control Union")).toBeInTheDocument();
    show({ today: "2026-11-06" });
    expect(screen.getByText("Süresi doldu")).toBeInTheDocument();
  });

  it("shows the sustainability figures when there are any and the verification code with a copy button", () => {
    show();

    const env = screen.getByRole("region", { name: "Sürdürülebilirlik" });
    expect(within(env).getByText("Enerji kaynakları")).toBeInTheDocument();
    expect(within(env).getByText("68")).toBeInTheDocument();
    expect(within(env).getByText("L/kg")).toBeInTheDocument();
    expect(screen.getAllByText("7Q4K-2M9X").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Kopyala/ })).toBeInTheDocument();
    // The address: in the QR verification list and in the footer.
    expect(screen.getAllByText("kozapass.vercel.app")).toHaveLength(2);
  });

  it("leaves out what it has nothing to say about", () => {
    show({ snapshot: { ...snapshot, certificates: [], supplyChain: snapshot.supplyChain.slice(0, 1).map((s) => ({ ...s, certificates: [] })) } });

    expect(screen.queryByRole("region", { name: "Sertifikalar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sürdürülebilirlik" })).not.toBeInTheDocument();
  });

  it("never shows anything from outside the snapshot's whitelist", () => {
    const { container } = show();

    for (const forbidden of ["quantity", "deliveredKg", "harvestYear", "phone", "score", "completeness"]) {
      expect(container.textContent?.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("PassportView, preview", () => {
  it("says what is still missing instead of hiding it", () => {
    const pending = { ...snapshot, supplyChain: snapshot.supplyChain.map((s) => (s.key === "s4" ? { ...s, approved: false, approvedAt: undefined, data: undefined } : s)) };

    show({ snapshot: pending, mode: "preview", verificationCode: undefined });

    expect(screen.getByText("Önizleme · Sürüm 2 taslağı")).toBeInTheDocument();
    expect(screen.getAllByText("Yayında oluşur").length).toBeGreaterThan(0);
    expect(screen.getByText("Henüz yayınlanmadı")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kopyala/ })).not.toBeInTheDocument();
  });
});

describe("the other states", () => {
  it("shows the scanned code when there is no passport for it, with no product information", () => {
    renderWithIntl(
      <PassportFrame>
        <PassportMissing kind="notfound" gtin="02012345000025" lot="NOPE-1" />
      </PassportFrame>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Bu kod için pasaport bulunamadı" })).toBeInTheDocument();
    expect(screen.getByText("02012345000025")).toBeInTheDocument();
    expect(screen.getByText("NOPE-1")).toBeInTheDocument();
  });

  it("says a withdrawn passport is withdrawn, in a banner and in the page, without a reason", () => {
    renderWithIntl(
      <PassportFrame banner={{ tone: "rejected", title: "Geri çekildi · bu pasaport artık geçerli değil", body: "Geri çekilme tarihi: 2 Kas 2026." }}>
        <PassportMissing kind="withdrawn" gtin="02012345000025" lot="KP-2026-0915-A" />
      </PassportFrame>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Geri çekildi · bu pasaport artık geçerli değil");
    expect(screen.getByRole("heading", { level: 1, name: "Bu pasaport üretici tarafından geri çekildi" })).toBeInTheDocument();
  });
});

describe("PassportFrame", () => {
  it("links the three languages with ?lang= and marks the current one", () => {
    renderWithIntl(
      <PassportFrame>
        <p>x</p>
      </PassportFrame>,
    );

    const nav = screen.getByRole("navigation", { name: "Dil" });
    expect(within(nav).getByRole("link", { name: "TR" })).toHaveAttribute("href", "?lang=tr");
    expect(within(nav).getByRole("link", { name: "DE" })).toHaveAttribute("href", "?lang=de");
    expect(within(nav).getByRole("link", { name: "TR" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "EN" })).not.toHaveAttribute("aria-current");
  });
});
