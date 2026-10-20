import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";
import { TasksBadge } from "./tasks-badge";

const tasks = vi.hoisted(() => ({ total: 7 as number | undefined, enabled: [] as boolean[], certificates: [] as unknown[] }));
const role = vi.hoisted(() => ({ value: "OWNER" }));

vi.mock("@/lib/api/tasks", () => ({
  useTasks: ({ enabled }: { enabled: boolean }) => {
    tasks.enabled.push(enabled);
    return { data: enabled && tasks.total !== undefined ? { total: tasks.total } : undefined };
  },
}));
vi.mock("@/lib/api/issues", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/issues")>()),
  useExpiringCertificates: ({ enabled }: { enabled: boolean }) => ({ data: enabled ? tasks.certificates : undefined }),
}));
vi.mock("@/lib/auth/use-session", () => ({
  useSession: () => ({ status: "authenticated", user: { role: role.value } }),
}));

describe("TasksBadge", () => {
  it("shows the open task count (v0.4 48a) with a spoken label", () => {
    tasks.total = 7;
    role.value = "OWNER";
    renderWithIntl(<TasksBadge />);

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("7 bekleyen görev")).toHaveClass("sr-only");
  });

  it("counts a certificate running out as a task too, once for each certificate however many batches use it", () => {
    tasks.total = 7;
    role.value = "OWNER";
    const cert = (id: string, batchId: string) => ({ documentId: id, supplierId: "s1", docType: "GOTS", validUntil: "2026-10-30", daysLeft: 9, stepId: id, stepType: "YARN", batchId, batchNo: batchId });
    tasks.certificates = [cert("d1", "b1"), cert("d2", "b2"), { ...cert("d3", "b3"), docType: "OEKO_TEX" }];
    renderWithIntl(<TasksBadge />);

    // Seven tasks and two certificates (the GOTS of two batches is one).
    expect(screen.getByText("9 bekleyen görev")).toHaveClass("sr-only");
    tasks.certificates = [];
  });

  it("is hidden without tasks, and supplier users do not ask for them", () => {
    tasks.total = 0;
    role.value = "OWNER";
    const { container } = renderWithIntl(<TasksBadge />);
    expect(container).toBeEmptyDOMElement();

    tasks.enabled.length = 0;
    tasks.total = 3;
    role.value = "SUPPLIER";
    const supplier = renderWithIntl(<TasksBadge />);
    expect(supplier.container).toBeEmptyDOMElement();
    expect(tasks.enabled).toEqual([false]);
  });
});
