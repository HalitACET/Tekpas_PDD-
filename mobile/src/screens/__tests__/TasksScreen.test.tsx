import { fireEvent, screen } from "@testing-library/react-native";
import i18n from "@/lib/i18n";
import { renderScreen, resetApi, route, signedInAs, testSession as mockSession } from "@/test/render";
import { TasksScreen } from "../TasksScreen";

// Read when a screen renders, after the imports: jest allows a factory to use names starting with "mock".
jest.mock("@/lib/use-session", () => ({ useSession: () => mockSession.state }));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
const now = new Date("2026-10-21T10:00:00Z");

const awaitingDoc = {
  id: "d1",
  docType: "GOTS",
  originalName: "gots.pdf",
  extractionStatus: "READ",
  extractionMethod: "LLM",
  proposedFields: 5,
  lowConfidence: 2,
  uploadedByName: "Mehmet",
  createdAt: "2026-10-21T08:00:00Z",
  stepId: "s1",
  stepType: "YARN",
  supplierName: "Ege İplik",
  batchId: "b1",
  batchNo: "KP-2026-0915-A",
  batchStatus: "COLLECTING",
};

function serve({ docs = [awaitingDoc], review = [] as unknown[], certs = [] as unknown[] } = {}) {
  route("GET", /\/documents\/awaiting-review$/, { body: docs });
  route("GET", /\/tasks$/, { body: { review, incomplete: [], followUp: [], total: review.length } });
  route("GET", /\/documents\/expiring$/, { body: certs });
}

beforeEach(() => {
  resetApi();
  signedInAs("OWNER");
});

describe("TasksScreen", () => {
  it("lists the waiting documents with their reading, and opens one", async () => {
    serve({
      review: [{ kind: "STEP_SUBMITTED", batchId: "b2", batchNo: "KP-2026-0920-B", productName: "Tişört", stepId: "s9", stepType: "DYEING", supplierName: "Boya AŞ" }],
      certs: [{ batchId: "b1", batchNo: "KP-1", batchStatus: "COLLECTING", daysLeft: 12, docType: "OEKO_TEX", documentId: "d7", stepId: "s2", stepType: "FABRIC", supplierName: "Kumaş AŞ", validUntil: "2026-11-02" }],
    });
    const onOpenDocument = jest.fn();

    await renderScreen(<TasksScreen onOpenDocument={onOpenDocument} onShoot={jest.fn()} now={now} />);

    expect(await screen.findByText(t("tasks.docsMine"))).toBeTruthy();
    expect(screen.getByText(t("tasks.aiReadLow", { count: 2 }))).toBeTruthy();
    expect(screen.getByText(t("tasks.data"))).toBeTruthy();
    expect(screen.getByText(t("tasks.dataNote"))).toBeTruthy();
    expect(screen.getByText(t("tasks.certs"))).toBeTruthy();
    expect(screen.getByText("Kumaş AŞ")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(`GOTS KP-2026-0915-A`));
    expect(onOpenDocument).toHaveBeenCalledWith("d1");
  });

  it("says when nothing is waiting", async () => {
    serve({ docs: [] });

    await renderScreen(<TasksScreen onOpenDocument={jest.fn()} onShoot={jest.fn()} now={now} />);

    expect(await screen.findByText(t("tasks.emptyTitle"))).toBeTruthy();
  });

  it("shows an error card with a way to try again when the server does not answer", async () => {
    await renderScreen(<TasksScreen onOpenDocument={jest.fn()} onShoot={jest.fn()} now={now} />);

    expect(await screen.findByText(t("tasks.errorTitle"))).toBeTruthy();
    expect(screen.getByText(t("common.retry"))).toBeTruthy();
  });

  it("closes the camera to a viewer", async () => {
    signedInAs("VIEWER");
    serve();
    const onShoot = jest.fn();

    await renderScreen(<TasksScreen onOpenDocument={jest.fn()} onShoot={onShoot} now={now} />);

    expect(await screen.findByText(t("tasks.viewerNote"))).toBeTruthy();
    await fireEvent.press(screen.getByText(t("tasks.shoot")));
    expect(onShoot).not.toHaveBeenCalled();
  });
});
