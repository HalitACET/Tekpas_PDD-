import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";
import { UploadDocumentDialog } from "./upload-dialog";

const batch = (id: string, batchNo: string, status = "COLLECTING") => ({
  id,
  batchNo,
  status,
  product: { name: "Organik Basic Tişört" },
});

const step = (id: string, stepType: string, sortOrder: number, supplier?: string) => ({
  id,
  stepType,
  sortOrder,
  status: "PENDING",
  data: {},
  supplier: supplier ? { name: supplier } : undefined,
});

const chains: Record<string, ReturnType<typeof step>[]> = {
  b1: [step("s2", "FABRIC", 2, "Akın Tekstil"), step("s1", "YARN", 1, "Maraş Penye İplik"), step("s3", "DYEING", 3)],
  b2: [],
};

vi.mock("@/lib/api/batches", () => ({
  useBatches: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    data: { content: [batch("b1", "KP-2026-0918-A"), batch("b2", "KP-2026-0918-B"), batch("b3", "KP-2026-0901-A", "PUBLISHED")] },
  }),
  useBatchChain: (id: string) => ({ isPending: false, isError: false, isSuccess: true, data: { steps: chains[id] ?? [] } }),
}));
vi.mock("@/lib/auth/use-session", () => ({
  useSession: () => ({ status: "authenticated", user: { role: "OWNER" } }),
}));
vi.mock("./documents-section", () => ({
  DocumentsSection: (props: { stepId: string; supplierName: string; published: boolean; canWrite: boolean }) => (
    <div data-testid="documents-section">
      {props.stepId} {props.supplierName} {String(props.canWrite)} {String(props.published)}
    </div>
  ),
}));

describe("UploadDocumentDialog", () => {
  it("asks for batch and step first, then shows that step's upload area", async () => {
    const user = userEvent.setup();
    renderWithIntl(<UploadDocumentDialog open onClose={() => {}} />);

    const next = screen.getByRole("button", { name: "Devam" });
    expect(next).toBeDisabled();
    expect(screen.getByRole("option", { name: /KP-2026-0901-A.*yayında/ })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Parti"), "b1");
    const stepSelect = screen.getByLabelText("Aşama");
    // Chain order, not response order; a step without supplier says so.
    expect([...stepSelect.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "Aşama seçin",
      "İplik · Maraş Penye İplik",
      "Kumaş · Akın Tekstil",
      "Boya · tedarikçi atanmadı",
    ]);
    await user.selectOptions(stepSelect, "s2");
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);

    expect(await screen.findByTestId("documents-section")).toHaveTextContent("s2 Akın Tekstil true false");
    expect(screen.getByText("KP-2026-0918-A · Organik Basic Tişört")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Değiştir" }));
    expect(screen.getByLabelText("Parti")).toHaveValue("");
  });

  it("clears the step when the batch changes and tells when a batch has no chain", async () => {
    const user = userEvent.setup();
    renderWithIntl(<UploadDocumentDialog open onClose={() => {}} />);

    await user.selectOptions(screen.getByLabelText("Parti"), "b1");
    await user.selectOptions(screen.getByLabelText("Aşama"), "s1");
    await user.selectOptions(screen.getByLabelText("Parti"), "b2");

    expect(screen.getByText(/Bu partinin tedarik zinciri yok/)).toBeInTheDocument();
    expect(screen.getByLabelText("Aşama")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Devam" })).toBeDisabled();
  });
});
