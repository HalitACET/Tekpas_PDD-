import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchResponse } from "@/lib/api/batches";
import { ApiError } from "@/lib/api/request";
import { renderWithIntl } from "@/test/render";

type Query = { data?: unknown; isPending: boolean; isError: boolean; isFetching: boolean; error?: unknown; refetch: () => void };

const state = vi.hoisted(() => ({
  role: "OWNER" as string,
  open: undefined as unknown as Query,
  resolved: undefined as unknown as Query,
  run: { mutate: vi.fn(), isPending: false },
  resolve: { mutate: vi.fn(), isPending: false, error: undefined as unknown, reset: vi.fn() },
  reopen: { mutate: vi.fn(), isPending: false, error: undefined as unknown },
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/auth/use-session", () => ({ useSession: () => ({ status: "authenticated", user: { role: state.role } }) }));
vi.mock("@/lib/api/issues", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/issues")>()),
  useBatchIssues: (_: string, status: string) => (status === "OPEN" ? state.open : state.resolved),
  useValidateBatch: () => state.run,
  useResolveIssue: () => state.resolve,
  useReopenIssue: () => state.reopen,
}));

import { AlertsTab } from "./alerts-tab";

const batch = { id: "b1", batchNo: "KP-2026-0915-A", product: { id: "p1", name: "Organik Pamuk Polo", gtin: "02012345000025" } } as BatchResponse;

const ok = (data: unknown): Query => ({ data, isPending: false, isError: false, isFetching: false, refetch: vi.fn() });
const issue = (over: object) => ({
  id: "i",
  code: "SER-02",
  severity: "WARNING",
  source: "RULE",
  stepId: "s1",
  stepType: "DYEING",
  supplierName: "Uludağ Boya Terbiye",
  params: { docType: "OEKO_TEX", validUntil: "2099-01-01" },
  resolved: false,
  autoResolved: false,
  createdAt: "2026-10-20T10:00:00Z",
  ...over,
});
const lif01 = issue({
  id: "lif",
  code: "LIF-01",
  severity: "ERROR",
  stepType: "YARN",
  supplierName: "Ege İplik",
  params: {
    label: [{ fiber: "ORGANIC_COTTON", percent: 95 }, { fiber: "ELASTANE", percent: 5 }],
    declared: [{ fiber: "COTTON", percent: 80 }, { fiber: "POLYESTER", percent: 20 }],
    differing: ["ORGANIC_COTTON", "ELASTANE", "COTTON", "POLYESTER"],
  },
});
const ser02 = issue({ id: "ser02" });
const eks02 = issue({ id: "eks02", code: "EKS-02", severity: "INFO", stepId: undefined, stepType: undefined, supplierName: undefined, params: { missing: "BOTH" } });

const list = (issues: unknown[], open = { errors: 0, warnings: 0, infos: 0 }, resolved = 0, validatedAt: string | null = "2026-10-20T11:32:00Z") => ({
  issues,
  open,
  resolved,
  validatedAt,
});

beforeEach(() => {
  state.role = "OWNER";
  state.open = ok(list([lif01, ser02, eks02], { errors: 1, warnings: 1, infos: 1 }, 2));
  state.resolved = ok(list([], { errors: 1, warnings: 1, infos: 1 }, 2));
  state.run = { mutate: vi.fn(), isPending: false };
  state.resolve = { mutate: vi.fn(), isPending: false, error: undefined, reset: vi.fn() };
  state.reopen = { mutate: vi.fn(), isPending: false, error: undefined };
});

describe("AlertsTab", () => {
  it("lists the open alerts with severity, fixed code, rule and the comparison of the label with the supplier's declaration", () => {
    renderWithIntl(<AlertsTab batch={batch} />);

    const blocking = screen.getByRole("article", { name: /LIF-01/ });
    expect(within(blocking).getByText("Engelleyici")).toBeInTheDocument();
    expect(within(blocking).getByText("LIF-01")).toBeInTheDocument();
    expect(within(blocking).getByText("Kural · Lif bileşimi tutarlılığı")).toBeInTheDocument();
    expect(within(blocking).getByText("Etiket ile Ege İplik lif beyanı uyuşmuyor.")).toBeInTheDocument();
    expect(within(blocking).getByText("Etiket beyanı")).toBeInTheDocument();
    expect(within(blocking).getByText("Ege İplik beyanı")).toBeInTheDocument();
    expect(within(blocking).getByText("%95 organik pamuk")).toHaveClass("text-status-rejected-foreground");
    // A blocking alert has no "Çözüldü", only the note that it blocks.
    expect(within(blocking).queryByRole("button", { name: "Çözüldü" })).not.toBeInTheDocument();
    expect(within(blocking).getByText("Düzeltilene kadar yayını engeller")).toBeInTheDocument();
    expect(within(blocking).getByRole("link", { name: "Adıma git" })).toHaveAttribute("href", "/batches/b1?step=s1");
    expect(within(blocking).getByRole("link", { name: "Düzeltme iste" })).toHaveAttribute("href", "/batches/b1?step=s1&open=request");

    const warning = screen.getByRole("article", { name: /SER-02/ });
    expect(within(warning).getByText("Uyarı")).toBeInTheDocument();
    expect(within(warning).getByText(/OEKO-TEX Standard 100 .* gün içinde doluyor/)).toBeInTheDocument();
    expect(within(warning).getByRole("button", { name: "Çözüldü" })).toBeEnabled();
    expect(within(warning).getByRole("link", { name: "Yenisini talep et" })).toBeInTheDocument();

    const info = screen.getByRole("article", { name: /EKS-02/ });
    expect(within(info).getByText("Bilgi")).toBeInTheDocument();
    expect(within(info).getByText("Üretim tarihleri girilmemiş.")).toBeInTheDocument();
  });

  it("counts both sides in the filter and shows when the checks last ran", () => {
    renderWithIntl(<AlertsTab batch={batch} />);

    expect(screen.getByRole("radio", { name: /Açık/ })).toHaveTextContent("3");
    expect(screen.getByRole("radio", { name: /Çözülen/ })).toHaveTextContent("2");
    expect(screen.getByText(/Son kontrol: .*\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("runs the checks with the button", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AlertsTab batch={batch} />);

    await user.click(screen.getByRole("button", { name: "Kontrolleri çalıştır" }));

    expect(state.run.mutate).toHaveBeenCalledTimes(1);
  });

  it("says the checks are running and closes the button meanwhile", () => {
    state.run = { mutate: vi.fn(), isPending: true };
    renderWithIntl(<AlertsTab batch={batch} />);

    expect(screen.getByRole("button", { name: "Kontrol ediliyor…" })).toBeDisabled();
    expect(screen.getByText("Kontroller çalışıyor")).toBeInTheDocument();
  });

  it("resolves a warning with a note through the small form in the card", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AlertsTab batch={batch} />);

    const card = screen.getByRole("article", { name: /SER-02/ });
    await user.click(within(card).getByRole("button", { name: "Çözüldü" }));
    await user.type(within(card).getByRole("textbox"), "Yenisi yolda");
    expect(within(card).getByText("12/500")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Çözüldü işaretle" }));

    expect(state.resolve.mutate).toHaveBeenCalledWith({ id: "ser02", note: "Yenisi yolda" }, expect.anything());
  });

  it("can drop the form without resolving, and resolves without a note", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AlertsTab batch={batch} />);

    const card = screen.getByRole("article", { name: /SER-02/ });
    await user.click(within(card).getByRole("button", { name: "Çözüldü" }));
    await user.click(within(card).getByRole("button", { name: "Vazgeç" }));
    expect(within(card).queryByRole("textbox")).not.toBeInTheDocument();
    expect(state.resolve.mutate).not.toHaveBeenCalled();

    await user.click(within(card).getByRole("button", { name: "Çözüldü" }));
    await user.click(within(card).getByRole("button", { name: "Çözüldü işaretle" }));
    expect(state.resolve.mutate).toHaveBeenCalledWith({ id: "ser02", note: undefined }, expect.anything());
  });

  it("lets an editor run the checks but not resolve, and a viewer neither", () => {
    state.role = "EDITOR";
    const editor = renderWithIntl(<AlertsTab batch={batch} />);
    expect(screen.getByRole("button", { name: "Kontrolleri çalıştır" })).toBeEnabled();
    const warning = screen.getByRole("article", { name: /SER-02/ });
    const resolve = within(warning).getByRole("button", { name: "Çözüldü" });
    expect(resolve).toHaveAttribute("aria-disabled", "true");
    expect(resolve).toHaveAttribute("aria-description", "Bu işlem için yetkiniz yok");
    expect(within(warning).getByRole("link", { name: "Yenisini talep et" })).toBeInTheDocument();
    editor.unmount();

    state.role = "VIEWER";
    renderWithIntl(<AlertsTab batch={batch} />);
    expect(screen.getByRole("button", { name: "Kontrolleri çalıştır" })).toHaveAttribute("aria-disabled", "true");
    // The request is a change of data: closed for a viewer, the step is still reachable.
    const viewerCard = screen.getByRole("article", { name: /LIF-01/ });
    expect(within(viewerCard).getByRole("button", { name: "Düzeltme iste" })).toHaveAttribute("aria-disabled", "true");
    expect(within(viewerCard).getByRole("link", { name: "Adıma git" })).toBeInTheDocument();
  });

  it("shows the resolved ones softly with who decided and why, and only those can be reopened", async () => {
    const user = userEvent.setup();
    state.resolved = ok(
      list(
        [
          issue({ id: "m", code: "SER-03", params: { docType: "GOTS", holder: "Demirtaş Tekstil Holding A.Ş.", supplier: "Demirtaş Örme Kumaş" }, resolved: true, resolvedAt: "2026-10-15T09:00:00Z", resolvedByName: "Elif Yılmaz", note: "Ana şirket" }),
          { ...lif01, id: "a", resolved: true, autoResolved: true, resolvedAt: "2026-10-18T09:00:00Z" },
        ],
        { errors: 0, warnings: 0, infos: 0 },
        2,
      ),
    );
    renderWithIntl(<AlertsTab batch={batch} />);
    await user.click(screen.getByRole("radio", { name: /Çözülen/ }));

    const manual = screen.getByRole("article", { name: /SER-03/ });
    expect(within(manual).getByText("Çözdü: Elif Yılmaz · 15 Eki 2026 — “Ana şirket”")).toBeInTheDocument();
    await user.click(within(manual).getByRole("button", { name: "Geri aç" }));
    expect(state.reopen.mutate).toHaveBeenCalledWith("m");
    const auto = screen.getByRole("article", { name: /LIF-01/ });
    expect(within(auto).getByText("Kendiliğinden kapandı · veri düzeltildi · 18 Eki 2026")).toBeInTheDocument();
    expect(within(auto).queryByRole("button", { name: "Geri aç" })).not.toBeInTheDocument();
  });

  it("does not offer to reopen to someone who cannot resolve", async () => {
    const user = userEvent.setup();
    state.role = "EDITOR";
    state.resolved = ok(list([issue({ id: "m", resolved: true, resolvedAt: "2026-10-15T09:00:00Z", resolvedByName: "Elif Yılmaz" })], undefined, 1));
    renderWithIntl(<AlertsTab batch={batch} />);
    await user.click(screen.getByRole("radio", { name: /Çözülen/ }));

    expect(screen.queryByRole("button", { name: "Geri aç" })).not.toBeInTheDocument();
  });

  it("says a blocking alert cannot be resolved by hand when the server refuses", () => {
    state.resolve.error = new ApiError(409, { type: "urn:tekpas:problem:conflict", title: "Conflict", status: 409, reason: "ISSUE_BLOCKING" } as never);
    renderWithIntl(<AlertsTab batch={batch} />);

    const alerts = screen.getAllByRole("alert");
    expect(alerts[0]).toHaveTextContent("Engelleyici uyarılar elle çözülemez; veriyi düzeltin.");
    expect(alerts[0]).toHaveTextContent("HTTP 409 · ISSUE_BLOCKING");
  });

  it("says when someone else resolved it first", () => {
    state.resolve.error = new ApiError(409, { type: "urn:tekpas:problem:conflict", title: "Conflict", status: 409, reason: "ALREADY_RESOLVED" } as never);
    renderWithIntl(<AlertsTab batch={batch} />);

    expect(screen.getAllByText("Bu uyarı zaten çözülmüş.").length).toBeGreaterThan(0);
  });

  it("is a skeleton while loading", () => {
    state.open = { isPending: true, isError: false, isFetching: true, refetch: vi.fn() };
    renderWithIntl(<AlertsTab batch={batch} />);

    expect(screen.getByLabelText("Uyarılar yükleniyor")).toHaveAttribute("aria-busy", "true");
    // The bar stays while the cards load.
    expect(screen.getByRole("button", { name: "Kontrolleri çalıştır" })).toBeInTheDocument();
  });

  it("says the alerts could not be loaded, with the server's answer, and offers to try again", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    state.open = { isPending: false, isError: true, isFetching: false, error: new ApiError(503, undefined, "7a2f-91cd"), refetch };
    renderWithIntl(<AlertsTab batch={batch} />);

    expect(screen.getByText("Uyarılar yüklenemedi")).toBeInTheDocument();
    expect(screen.getByText("HTTP 503 · istek 7a2f-91cd")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("says no alert is open, when the checks last ran, and offers to run them", () => {
    state.open = ok(list([], undefined, 3));
    renderWithIntl(<AlertsTab batch={batch} />);

    expect(screen.getByRole("heading", { name: "Açık uyarı yok" })).toBeInTheDocument();
    expect(screen.getByText(/Tüm kontroller geçti, son kontrol/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Kontrolleri çalıştır" })).toHaveLength(2);
  });

  it("says the checks have not run when they never did", () => {
    state.open = ok(list([], undefined, 0, null));
    renderWithIntl(<AlertsTab batch={batch} />);

    expect(screen.getByText(/Kontroller henüz çalıştırılmadı/)).toBeInTheDocument();
    expect(screen.getByText("Henüz kontrol edilmedi")).toBeInTheDocument();
  });

  it("says no alert is resolved yet on the resolved side", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AlertsTab batch={batch} />);
    await user.click(screen.getByRole("radio", { name: /Çözülen/ }));

    expect(screen.getByText("Çözülen uyarı yok")).toBeInTheDocument();
  });

  it("groups ten or more open alerts by severity under headings with their counts", () => {
    const many = [
      ...Array.from({ length: 2 }, (_, i) => ({ ...lif01, id: `e${i}` })),
      ...Array.from({ length: 7 }, (_, i) => ({ ...ser02, id: `w${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ ...eks02, id: `i${i}` })),
    ];
    state.open = ok(list(many, { errors: 2, warnings: 7, infos: 3 }));
    renderWithIntl(<AlertsTab batch={batch} />);

    const blocking = screen.getByRole("region", { name: "Engelleyici" });
    expect(within(blocking).getByText("Yayını engeller; veri düzelince kapanır")).toBeInTheDocument();
    expect(within(blocking).getAllByRole("article")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Uyarı" })).getAllByRole("article")).toHaveLength(7);
    expect(within(screen.getByRole("region", { name: "Bilgi" })).getAllByRole("article")).toHaveLength(3);
  });

  it("keeps a short list without headings", () => {
    renderWithIntl(<AlertsTab batch={batch} />);

    expect(screen.queryByRole("region", { name: "Engelleyici" })).not.toBeInTheDocument();
  });
});
