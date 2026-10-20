import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchResponse } from "@/lib/api/batches";
import type { ScoreResponse } from "@/lib/api/passports";
import { ApiError } from "@/lib/api/request";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({
  role: "OWNER" as string,
  versions: [] as unknown[],
  publish: { mutate: undefined as unknown, isPending: false, isError: false, error: undefined as unknown },
  published: undefined as unknown,
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/auth/use-session", () => ({ useSession: () => ({ status: "authenticated", user: { role: state.role } }) }));
vi.mock("@/lib/api/passports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/passports")>()),
  usePassportVersions: () => ({ data: state.versions, isError: false, isPending: false }),
  usePassportPreview: () => ({ data: { certificates: [{}, {}], supplyChain: [{ actor: { name: "A" } }, { actor: { name: "B" } }, { actor: { name: "A" } }] } }),
  usePublishPassport: () => ({
    isPending: state.publish.isPending,
    isError: state.publish.isError,
    error: state.publish.error,
    mutate: (_: unknown, options: { onSuccess?: (v: unknown) => void }) => {
      if (state.published) options.onSuccess?.(state.published);
    },
  }),
  useOpenPassportDraft: () => ({ mutate: () => {}, isPending: false }),
  useWithdrawPassport: () => ({ mutate: () => {}, isPending: false }),
  useQrPreview: () => ({ data: undefined, isPending: true, isError: false }),
  fetchQr: () => Promise.resolve(new Blob()),
}));

import { LifecycleChip } from "./lifecycle-chip";
import { PublishActions } from "./publish-actions";
import { ScoreCard } from "./score-card";

const batch = (over: Partial<BatchResponse> = {}): BatchResponse =>
  ({
    id: "b1",
    batchNo: "KP-2026-0915-A",
    product: { id: "p1", name: "Organik Pamuk Polo", gtin: "02012345000025" },
    status: "READY",
    quantity: 2400,
    score: 96,
    chain: { totalSteps: 5, approvedSteps: 5, stepStatuses: [] },
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...over,
  }) as BatchResponse;

const ready: ScoreResponse = {
  score: 96,
  threshold: 90,
  publishable: true,
  criteria: [
    { code: "STEPS_APPROVED", earned: 50, possible: 50, items: [{ code: "STEP_APPROVED", stepId: "s1", stepType: "YARN", ok: true }] },
    { code: "REQUIRED_FIELDS", earned: 30, possible: 30, items: [] },
    { code: "VALID_CERTIFICATES", earned: 16, possible: 20, items: [{ code: "STEP_CERTIFICATE", stepId: "s4", stepType: "DYEING", ok: false }] },
  ],
  blockers: [],
  warnings: [{ code: "UNREVIEWED_DOCUMENTS", count: 2 }, { code: "CERTIFICATE_EXPIRING", stepType: "FABRIC", docType: "OEKO_TEX", validUntil: "2099-01-01" }],
};

const blocked: ScoreResponse = {
  ...ready,
  score: 93,
  publishable: false,
  blockers: [{ code: "CERTIFICATE_EXPIRED", stepId: "s2", stepType: "YARN", docType: "GOTS", validUntil: "2026-10-12" }],
};

const below: ScoreResponse = {
  ...ready,
  score: 86,
  publishable: false,
  criteria: [{ code: "STEPS_APPROVED", earned: 40, possible: 50, items: [{ code: "STEP_APPROVED", stepId: "s5", stepType: "SEWING", ok: false }] }],
  blockers: [{ code: "STEP_NOT_APPROVED", stepId: "s5", stepType: "SEWING" }, { code: "SCORE_BELOW_THRESHOLD" }],
};

const card = (score: ScoreResponse | undefined, b = batch(), over: object = {}) =>
  renderWithIntl(<ScoreCard batch={b} score={{ data: score, isPending: false, isError: false, isFetching: false, ...over }} onRetry={() => {}} />);

beforeEach(() => {
  state.role = "OWNER";
  state.versions = [];
  state.publish = { mutate: undefined, isPending: false, isError: false, error: undefined };
  state.published = undefined;
});

describe("LifecycleChip", () => {
  it("says which version is live, that a draft of the next is open, and that a passport was withdrawn", () => {
    const published = renderWithIntl(<LifecycleChip batch={batch({ status: "PUBLISHED", passport: { version: 2, score: 94, withdrawn: false } })} />);
    expect(screen.getByText("Yayında · v2")).toBeInTheDocument();
    published.unmount();

    const draft = renderWithIntl(<LifecycleChip batch={batch({ status: "READY", passport: { version: 2, score: 94, withdrawn: false } })} />);
    expect(screen.getByText("Yayında v2")).toBeInTheDocument();
    expect(screen.getByText("v3 taslağı hazırlanıyor")).toBeInTheDocument();
    draft.unmount();

    const withdrawn = renderWithIntl(<LifecycleChip batch={batch({ status: "READY", passport: { version: 1, score: 88, withdrawn: true } })} />);
    expect(screen.getByText("Geri çekildi")).toBeInTheDocument();
    withdrawn.unmount();

    renderWithIntl(<LifecycleChip batch={batch({ status: "COLLECTING" })} />);
    expect(screen.getByText("Veri toplanıyor")).toBeInTheDocument();
  });
});

describe("ScoreCard", () => {
  it("shows the score, 'ready', the breakdown with what is missing and a link to the step", () => {
    card(ready);

    const region = screen.getByRole("region", { name: "Uyum skoru" });
    expect(within(region).getByText("%96")).toBeInTheDocument();
    expect(within(region).getByText("Yayına hazır")).toBeInTheDocument();
    expect(within(region).getByText("Yayın eşiği %90")).toBeInTheDocument();
    expect(within(region).getByText("16/20")).toBeInTheDocument();
    const missing = within(region).getByRole("link", { name: /Boya · sertifika yok/ });
    expect(missing).toHaveAttribute("href", "/batches/b1?step=s4");
    expect(within(region).getAllByText("Eksik yok")).toHaveLength(2);
    expect(within(region).queryByText("Yayın engelleri")).not.toBeInTheDocument();
  });

  it("says how far under the threshold it is and lists the blockers in the design's words", () => {
    card(below);

    expect(screen.getByText("Eşiğin 4 puan altında")).toBeInTheDocument();
    expect(screen.getByText("Yayın engelleri")).toBeInTheDocument();
    expect(screen.getByText("Konfeksiyon adımı onaylanmadı")).toBeInTheDocument();
    expect(screen.getByText("Uyum skoru %86, yayın için en az %90 gerekli")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Konfeksiyon · onay bekliyor/ })).toHaveAttribute("href", "/batches/b1?step=s5");
  });

  it("says the threshold is passed but something blocks, with the expired certificate named", () => {
    card(blocked);

    expect(screen.getByText("Eşik aşıldı, 1 engel var")).toBeInTheDocument();
    expect(screen.getByText(/İplik · GOTS sertifikası süresi 12 Eki 2026 tarihinde doldu/)).toBeInTheDocument();
  });

  it("shows the published version, the score it had and 'Yayında'", () => {
    state.versions = [{ id: "pp1", status: "PUBLISHED", publishedAt: "2026-10-28T09:00:00Z" }];
    card(ready, batch({ status: "PUBLISHED", passport: { version: 2, score: 94, withdrawn: false } }));

    expect(screen.getByText("%94")).toBeInTheDocument();
    expect(screen.getByText("Yayında")).toBeInTheDocument();
    expect(screen.getByText("Yayındaki sürüm: v2")).toBeInTheDocument();
    expect(screen.getByText(/Yayın anındaki değer · 28 Eki/)).toBeInTheDocument();
  });

  it("is a skeleton while computing and says so when it failed", () => {
    const loading = renderWithIntl(<ScoreCard batch={batch()} score={{ isPending: true, isError: false, isFetching: true }} onRetry={() => {}} />);
    expect(screen.getByText("Skor hesaplanıyor…")).toBeInTheDocument();
    loading.unmount();

    card(undefined, batch(), { isError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Skor hesaplanamadı");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });
});

describe("PublishActions", () => {
  it("offers the preview and a publish button that is open when nothing blocks", () => {
    renderWithIntl(<PublishActions batch={batch()} score={{ data: ready, isPending: false }} />);

    expect(screen.getByRole("link", { name: "Önizle" })).toHaveAttribute("href", "/batches/b1/preview");
    expect(screen.getByRole("button", { name: "Pasaportu yayınla" })).toBeEnabled();
    expect(screen.queryByRole("list", { name: /Yayın kilitli|kilitli/i })).not.toBeInTheDocument();
  });

  it("locks publishing and lists the reasons while something blocks", () => {
    renderWithIntl(<PublishActions batch={batch()} score={{ data: below, isPending: false }} />);

    expect(screen.getByRole("button", { name: "Pasaportu yayınla" })).toBeDisabled();
    expect(screen.getByText("Konfeksiyon adımı onaylanmadı")).toBeInTheDocument();
  });

  it("does not let an editor publish, and says why", () => {
    state.role = "EDITOR";
    renderWithIntl(<PublishActions batch={batch()} score={{ data: ready, isPending: false }} />);

    const publish = screen.getByRole("button", { name: "Pasaportu yayınla" });
    // Disabled but focusable (the tooltip says why): aria-disabled, not the disabled attribute.
    expect(publish).toHaveAttribute("aria-disabled", "true");
    expect(publish).toHaveAttribute("aria-description", "Bu işlem için yetkiniz yok");
    // Everyone who can read may preview.
    expect(screen.getByRole("link", { name: "Önizle" })).toBeInTheDocument();
  });

  it("shows the public address, the QR and the menu once published", () => {
    renderWithIntl(<PublishActions batch={batch({ status: "PUBLISHED", passport: { version: 2, score: 94, withdrawn: false } })} score={{ data: ready, isPending: false }} />);

    expect(screen.getByRole("link", { name: /Pasaportu aç/ })).toHaveAttribute("href", "/01/02012345000025/10/KP-2026-0915-A");
    expect(screen.getByRole("link", { name: /QR/ })).toHaveAttribute("href", "#qr-card");
    expect(screen.getByRole("button", { name: "Diğer işlemler" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pasaportu yayınla" })).not.toBeInTheDocument();
  });

  it("opens the publish dialog with what will be published, the warnings and the lock note", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PublishActions batch={batch({ status: "READY", passport: { version: 2, score: 94, withdrawn: false } })} score={{ data: ready, isPending: false }} />);

    await user.click(screen.getByRole("button", { name: "Pasaportu yayınla" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Sürüm 3 yayınlanacak")).toBeInTheDocument();
    expect(within(dialog).getByText("%96")).toBeInTheDocument();
    expect(within(dialog).getByText("v2 “Eski sürüm” olur")).toBeInTheDocument();
    expect(within(dialog).getByText(/2 belge onay bekliyor, pasaporta girmeyecek/)).toBeInTheDocument();
    expect(within(dialog).getByText("Yayınlanan pasaport değiştirilemez.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Yayınla" })).toBeEnabled();
  });

  it("shows the blockers the server refused with, and does not offer to publish again", async () => {
    const user = userEvent.setup();
    state.publish = {
      mutate: undefined,
      isPending: false,
      isError: true,
      error: new ApiError(409, { type: "urn:tekpas:problem:conflict", title: "Conflict", status: 409, reason: "PUBLISH_BLOCKED", blockers: blocked.blockers } as never),
    };
    renderWithIntl(<PublishActions batch={batch()} score={{ data: ready, isPending: false }} />);

    await user.click(screen.getByRole("button", { name: "Pasaportu yayınla" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Yayın durduruldu: yeni bir engel çıktı.")).toBeInTheDocument();
    expect(within(dialog).getByText(/İplik · GOTS sertifikası süresi/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Yayınla" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Skor kartına dön" })).toBeInTheDocument();
  });

  it("says someone else published first when the server says it is published already", async () => {
    const user = userEvent.setup();
    state.publish = {
      mutate: undefined,
      isPending: false,
      isError: true,
      error: new ApiError(409, { type: "urn:tekpas:problem:conflict", title: "Conflict", status: 409, reason: "ALREADY_PUBLISHED" } as never),
    };
    renderWithIntl(<PublishActions batch={batch()} score={{ data: ready, isPending: false }} />);

    await user.click(screen.getByRole("button", { name: "Pasaportu yayınla" }));

    expect(await screen.findByText("Başka biri az önce yayınladı.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sayfayı yenile" })).toBeInTheDocument();
  });

  it("shows the success view with the version once the server published", async () => {
    const user = userEvent.setup();
    state.published = { id: "pp3", version: 3, batchNo: "KP-2026-0915-A", gtin: "02012345000025", digitalLink: "http://localhost:3000/01/02012345000025/10/KP-2026-0915-A" };
    renderWithIntl(<PublishActions batch={batch({ status: "READY", passport: { version: 2, score: 94, withdrawn: false } })} score={{ data: ready, isPending: false }} />);

    await user.click(screen.getByRole("button", { name: "Pasaportu yayınla" }));
    await user.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Yayınla" }));

    expect(await screen.findByText("Sürüm 3 yayında")).toBeInTheDocument();
    expect(screen.getByText(/QR okutanlar artık Sürüm 3 sayfasını görür\. Sürüm 2 “Eski sürüm” oldu/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PNG indir" })).toBeInTheDocument();
  });
});
