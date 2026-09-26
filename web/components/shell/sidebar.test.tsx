import { act, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";
import { useSidebarCollapsed } from "./app-shell";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/batches" }));

beforeEach(() => localStorage.clear());

describe("Sidebar", () => {
  it("shows the design's groups and marks the current page", () => {
    renderWithIntl(<Sidebar collapsed={false} onToggle={() => {}} />);

    const nav = screen.getByRole("navigation", { name: "Ana menü" });
    for (const label of ["Görevler", "Ürünler", "Partiler", "Tedarikçiler", "Belgeler", "İçe aktarma", "Kullanıcılar", "Ayarlar"]) {
      expect(nav).toContainElement(screen.getByRole("link", { name: label }));
    }
    expect(screen.getByRole("link", { name: "Partiler" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ürünler" })).not.toHaveAttribute("aria-current");
    for (const group of ["Pasaport", "Tedarik zinciri", "Yönetim"]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it("keeps links named by aria-label when collapsed to icons", () => {
    renderWithIntl(<Sidebar collapsed onToggle={() => {}} />);

    expect(screen.getByRole("link", { name: "Partiler" })).toBeInTheDocument();
    expect(screen.queryByText("Pasaport")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menüyü genişlet" })).toHaveAttribute("aria-expanded", "false");
  });

  it("calls onToggle from the collapse button", async () => {
    const onToggle = vi.fn();
    renderWithIntl(<Sidebar collapsed={false} onToggle={onToggle} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Menüyü daralt" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("useSidebarCollapsed", () => {
  it("remembers the choice in localStorage", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]());

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("kozapass.sidebar.collapsed")).toBe("1");
    expect(renderHook(() => useSidebarCollapsed()).result.current[0]).toBe(true);
  });
});
