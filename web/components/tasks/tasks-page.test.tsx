import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({
  role: "OWNER" as string,
  tasks: { total: 0, review: [], followUp: [], incomplete: [] } as unknown,
  certificates: [] as unknown[],
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/shell/page-view", () => ({ PageView: () => null }));
vi.mock("@/lib/auth/use-session", () => ({ useSession: () => ({ status: "authenticated", user: { role: state.role, company: { name: "Kozatex" }, fullName: "Elif" } }) }));
vi.mock("@/lib/api/tasks", () => ({
  useTasks: () => ({ data: state.tasks, isPending: false, isError: false, isFetching: false, refetch: () => {} }),
}));
vi.mock("@/lib/api/issues", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/issues")>()),
  useExpiringCertificates: () => ({ data: state.certificates }),
}));

import { TasksPage } from "./tasks-page";

const cert = (over: object) => ({
  documentId: "d1",
  docType: "GOTS",
  validUntil: "2026-10-12",
  daysLeft: -9,
  holderName: "Ege İplik",
  stepId: "s1",
  stepType: "YARN",
  supplierId: "sup1",
  supplierName: "Ege İplik",
  batchId: "b1",
  batchNo: "KP-2026-0915-A",
  batchStatus: "COLLECTING",
  ...over,
});

beforeEach(() => {
  state.role = "OWNER";
  state.tasks = { total: 0, review: [], followUp: [], incomplete: [] };
  state.certificates = [];
});

describe("TasksPage certificates", () => {
  it("lists a certificate that ended in red and one running out, each once with the batches that use it", () => {
    state.certificates = [
      cert({}),
      cert({ documentId: "d2", batchId: "b2", batchNo: "KP-2026-0918-A", stepId: "s2" }),
      cert({ documentId: "d3", docType: "OEKO_TEX", validUntil: "2026-11-02", daysLeft: 12, supplierName: "Uludağ Boya Terbiye", supplierId: "sup2", stepType: "DYEING", stepId: "s3", batchId: "b1" }),
    ];
    renderWithIntl(<TasksPage />);

    const group = screen.getByRole("region", { name: /Süresi yaklaşan sertifikalar/ });
    const rows = within(group).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Süresi doldu")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Ege İplik · GOTS sertifikası/)).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: "KP-2026-0915-A" })).toHaveAttribute("href", "/batches/b1?step=s1");
    expect(within(rows[0]).getByRole("link", { name: "KP-2026-0918-A" })).toHaveAttribute("href", "/batches/b2?step=s2");
    expect(within(rows[0]).getByRole("link", { name: "Adıma git" })).toHaveAttribute("href", "/batches/b1?step=s1");
    expect(within(rows[0]).getByRole("link", { name: "Yenisini talep et" })).toHaveAttribute("href", "/batches/b1?step=s1&open=request");
    expect(within(rows[1]).getByText("Süresi yaklaşıyor")).toBeInTheDocument();
    expect(within(rows[1]).getByText("12 gün içinde doluyor")).toBeInTheDocument();
    // The summary counts the certificates with the other tasks.
    expect(screen.getByText(/^2 görev/)).toBeInTheDocument();
  });

  it("hides the group when no certificate is running out, and shows the empty page without any task", () => {
    renderWithIntl(<TasksPage />);

    expect(screen.queryByRole("region", { name: /Süresi yaklaşan sertifikalar/ })).not.toBeInTheDocument();
    expect(screen.getByText("Bekleyen görev yok")).toBeInTheDocument();
  });

  it("does not give a viewer the request button", () => {
    state.role = "VIEWER";
    state.certificates = [cert({})];
    renderWithIntl(<TasksPage />);

    expect(screen.getByRole("button", { name: "Yenisini talep et" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Adıma git" })).toBeInTheDocument();
  });
});
