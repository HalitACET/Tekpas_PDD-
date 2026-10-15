import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";
import { TasksBadge } from "./tasks-badge";

const tasks = vi.hoisted(() => ({ total: 7 as number | undefined, enabled: [] as boolean[] }));
const role = vi.hoisted(() => ({ value: "OWNER" }));

vi.mock("@/lib/api/tasks", () => ({
  useTasks: ({ enabled }: { enabled: boolean }) => {
    tasks.enabled.push(enabled);
    return { data: enabled && tasks.total !== undefined ? { total: tasks.total } : undefined };
  },
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
