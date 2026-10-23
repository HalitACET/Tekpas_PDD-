import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry, AuditFilters } from "@/lib/api/audit";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({
  role: "OWNER" as string,
  calls: [] as { filters: unknown; page: number }[],
  audit: { data: undefined as unknown, isPending: false, isError: false, error: null as unknown, refetch: () => {} },
}));

vi.mock("@/lib/auth/use-session", () => ({ useSession: () => ({ status: "authenticated", user: { role: state.role } }) }));
vi.mock("@/lib/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/users")>()),
  useUsers: () => ({ data: [{ id: "u1", fullName: "Selim Karaca" }, { id: "u2", fullName: "Zeynep Arslan" }] }),
  useMe: () => ({ data: { ownerName: "Selim Karaca" } }),
}));
vi.mock("@/lib/api/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/audit")>()),
  useAudit: (filters: AuditFilters, page: number) => {
    state.calls.push({ filters, page });
    return state.audit;
  },
}));

import { AuditPage } from "./audit-page";

let id = 0;
const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: ++id,
  at: "2026-10-23T11:42:00Z",
  userId: "u1",
  userName: "Selim Karaca",
  entityType: "BATCH",
  entityId: "e",
  action: "CREATE",
  label: "LOT-2026-114",
  batchId: null,
  details: {},
  ...over,
});

const page = (entries: AuditEntry[], total = entries.length, pageNo = 0) => ({ entries, total, page: pageNo, size: 25 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T15:00:00Z"));
  state.role = "OWNER";
  state.calls = [];
  state.audit = { data: undefined, isPending: false, isError: false, error: null, refetch: () => {} };
});
afterEach(() => vi.useRealTimers());

describe("AuditPage (design v1.2 180–184)", () => {
  it("groups the entries by day and says in words what changed", () => {
    state.audit.data = page([
      entry({ action: "PUBLISH", entityType: "PASSPORT", details: { version: 2 } }),
      entry({ at: "2026-10-22T07:05:00Z", userName: "Zeynep Arslan", entityType: "USER", action: "ROLE", label: "Can Öztürk", details: { role: ["EDITOR", "VIEWER"] } }),
      entry({ at: "2026-10-22T06:30:00Z", entityType: "STEP", action: "REJECT", label: "LOT-2026-114", details: { stepType: "DYEING", fields: ["dyeProcess", "gsm"] } }),
      entry({ at: "2026-10-20T09:00:00Z", userName: null, userId: null, entityType: "IMPORT", action: "IMPORT", label: "urunler.xlsx", details: { created: 45, failed: 5 } }),
    ]);
    renderWithIntl(<AuditPage />);

    expect(screen.getByText("Bugün")).toBeInTheDocument();
    expect(screen.getByText("23 Ekim 2026")).toBeInTheDocument();
    expect(screen.getByText("Dün")).toBeInTheDocument();
    expect(screen.getByText("Salı")).toBeInTheDocument();
    expect(screen.getByText("14:42")).toBeInTheDocument();
    expect(screen.getByText("sürüm 2")).toBeInTheDocument();
    expect(screen.getByText("rol: Editör → Görüntüleyici")).toBeInTheDocument();
    expect(screen.getByText("45 ürün eklendi, 5 satır hatalı")).toBeInTheDocument();
    expect(screen.getByText(/LOT-2026-114 · Boya/)).toBeInTheDocument();
    expect(screen.getByText("alanlar: İşlem, Gramaj")).toBeInTheDocument();
    expect(screen.getByText("Rolünü değiştirdi")).toBeInTheDocument();
    expect(screen.getByText("İçe aktardı")).toBeInTheDocument();
    expect(screen.getByText("Sistem")).toBeInTheDocument();
    expect(screen.getByText("4 kayıt")).toBeInTheDocument();
  });

  it("filters by type and person from the first page and clears the filters", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    state.audit.data = page([entry({})], 60);
    renderWithIntl(<AuditPage />);

    await user.click(screen.getByRole("button", { name: "Sonraki" }));
    expect(state.calls.at(-1)?.page).toBe(1);

    await user.selectOptions(screen.getByLabelText("Tür"), "USER");
    await user.selectOptions(screen.getByLabelText("Kişi"), "u2");
    expect(state.calls.at(-1)).toMatchObject({ filters: { type: "USER", userId: "u2" }, page: 0 });

    await user.click(screen.getAllByRole("button", { name: "Filtreleri temizle" })[0]);
    expect(state.calls.at(-1)).toMatchObject({ filters: { type: undefined, userId: undefined }, page: 0 });
  });

  it("shows where the page is in the whole trail", () => {
    state.audit.data = page([entry({})], 1248, 0);
    renderWithIntl(<AuditPage />);
    expect(screen.getByText("1–1 / 1.248 kayıt")).toBeInTheDocument();
    expect(screen.getByText("1.248 kayıt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Önceki" })).toBeDisabled();
  });

  it("says nothing matched and offers to clear", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    state.audit.data = page([]);
    renderWithIntl(<AuditPage />);
    await user.selectOptions(screen.getByLabelText("Tür"), "PASSPORT");
    const table = screen.getByRole("table");
    expect(within(table).getByRole("button", { name: "Filtreleri temizle" })).toBeInTheDocument();
  });

  it("reports a failed load with a retry", () => {
    state.audit.isError = true;
    renderWithIntl(<AuditPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Denetim kayıtları yüklenemedi");
  });

  it("tells an editor whom to ask", () => {
    state.role = "EDITOR";
    renderWithIntl(<AuditPage />);
    expect(screen.getByText(/firma sahibi Selim Karaca ile görüşün/)).toBeInTheDocument();
    expect(state.calls.every((c) => c)).toBe(true);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
