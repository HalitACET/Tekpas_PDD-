import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchResponse } from "@/lib/api/batches";
import { ApiError } from "@/lib/api/request";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, isError: false, error: undefined as unknown, isFetching: false, refetch: () => {} },
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api/passports", () => ({ usePassportVersions: () => state.query }));

import { VersionsTab } from "./versions-tab";

const batch = { id: "b1", batchNo: "KP-2026-0915-A", status: "PUBLISHED" } as BatchResponse;
const version = (over: object) => ({
  id: "v",
  version: 1,
  status: "PUBLISHED",
  digitalLink: "http://localhost:3000/01/02012345000025/10/KP-2026-0915-A",
  completeness: 91,
  publishedAt: "2026-10-03T09:00:00Z",
  publishedByName: "Ahmet Demir",
  ...over,
});

beforeEach(() => {
  state.query = { data: undefined, isError: false, error: undefined, isFetching: false, refetch: () => {} };
});

describe("VersionsTab", () => {
  it("lists each version with its state, date, publisher and score, and opens it in the panel", () => {
    state.query.data = [
      version({ id: "v3", version: 3, completeness: 96, publishedAt: "2026-11-04T09:00:00Z", publishedByName: "Elif Yılmaz" }),
      version({ id: "v2", version: 2, status: "SUPERSEDED", completeness: 94, publishedAt: "2026-10-28T09:00:00Z" }),
      version({
        id: "v1",
        version: 1,
        status: "WITHDRAWN",
        withdrawnByName: "Elif Yılmaz",
        withdrawnAt: "2026-10-15T09:00:00Z",
        withdrawReason: "Etiketteki lif oranı hatalı basıldı",
      }),
    ];

    renderWithIntl(<VersionsTab batch={batch} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("v3")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Yayında")).toBeInTheDocument();
    expect(within(rows[0]).getByText("%96")).toBeInTheDocument();
    expect(within(rows[0]).getByText("4 Kas 2026")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: /Herkese açık/ })).toHaveAttribute("href", "/01/02012345000025/10/KP-2026-0915-A");
    expect(within(rows[1]).getByText("Eski sürüm")).toBeInTheDocument();
    // Only the published one has a public address.
    expect(within(rows[1]).queryByRole("link", { name: /Herkese açık/ })).not.toBeInTheDocument();
    expect(within(rows[2]).getByText("Geri çekildi")).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Geri çeken Elif Yılmaz · 15 Eki 2026 — “Etiketteki lif oranı hatalı basıldı”/)).toBeInTheDocument();
    expect(within(rows[2]).getByRole("link", { name: "Görüntüle" })).toHaveAttribute("href", "/batches/b1/passports/v1");
    expect(screen.getByText(/yalnızca panelde görünür; QR her zaman yayındaki sürümü açar/)).toBeInTheDocument();
  });

  it("keeps the published version's public link while a draft of the next is open", () => {
    state.query.data = [version({ id: "v1" })];

    renderWithIntl(<VersionsTab batch={{ ...batch, status: "READY" } as BatchResponse} />);

    expect(screen.getByRole("link", { name: /Herkese açık/ })).toBeInTheDocument();
  });

  it("says there is no version yet", () => {
    state.query.data = [];

    renderWithIntl(<VersionsTab batch={batch} />);

    expect(screen.getByText("Henüz yayınlanmış sürüm yok")).toBeInTheDocument();
  });

  it("says the versions could not be loaded, with the server's answer, and offers to try again", () => {
    state.query = { ...state.query, isError: true, error: new ApiError(503, undefined, "4c1e-08ab") };

    renderWithIntl(<VersionsTab batch={batch} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Sürümler yüklenemedi");
    expect(screen.getByText("HTTP 503 · 4c1e-08ab")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });
});
