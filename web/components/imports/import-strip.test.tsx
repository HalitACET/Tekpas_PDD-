import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportResponse } from "@/lib/api/imports";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({ data: [] as unknown[] }));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api/imports", () => ({ useImports: () => ({ data: state.data }) }));

import { ImportStrip } from "./import-strip";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const job = (over: Partial<ImportResponse> = {}): ImportResponse => ({
  id: "i1",
  kind: "PRODUCTS",
  fileName: "urunler_ekim.xlsx",
  fileSize: 86_000,
  status: "DONE",
  totalRows: 50,
  createdRows: 45,
  failedRows: 5,
  errors: [],
  failureCode: null,
  createdByName: "Elif Yılmaz",
  createdAt: minutesAgo(3),
  finishedAt: minutesAgo(2),
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe("ImportStrip (design v1.1 157b)", () => {
  it("says how many products were just imported and links to the result", () => {
    state.data = [job()];
    renderWithIntl(<ImportStrip />);

    expect(screen.getByRole("status")).toHaveTextContent("Az önce 45 ürün içe aktarıldı5 satır hatalı · urunler_ekim.xlsx");
    expect(screen.getByRole("link", { name: "Sonucu gör" })).toHaveAttribute("href", "/imports?id=i1");
  });

  it("stays closed for that import once closed", async () => {
    const user = userEvent.setup();
    state.data = [job()];
    const view = renderWithIntl(<ImportStrip />);

    await user.click(screen.getByRole("button", { name: "Kapat" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    view.unmount();
    renderWithIntl(<ImportStrip />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says nothing for an old, failed, running or empty import", () => {
    for (const latest of [
      job({ finishedAt: minutesAgo(45) }),
      job({ status: "FAILED", createdRows: 0 }),
      job({ status: "RUNNING", finishedAt: null }),
      job({ createdRows: 0 }),
    ]) {
      state.data = [latest];
      const view = renderWithIntl(<ImportStrip />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
