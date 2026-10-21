import { fireEvent, screen } from "@testing-library/react-native";
import i18n from "@/lib/i18n";
import { renderScreen, resetApi, route, signedInAs, testSession as mockSession } from "@/test/render";
import { BatchScreen } from "../BatchScreen";

// Read when a screen renders, after the imports: jest allows a factory to use names starting with "mock".
jest.mock("@/lib/use-session", () => ({ useSession: () => mockSession.state }));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

const step = (id: string, stepType: string, status: string, sortOrder: number, documentCount = 1) => ({
  id,
  stepType,
  status,
  sortOrder,
  documentCount,
  unreviewedDocumentCount: 0,
  inputStepIds: [],
  data: {},
  updatedAt: "2026-10-21T10:00:00Z",
  supplier: { id: `sup-${id}`, name: "Ege İplik", type: "YARN" },
});

function serve(status = "COLLECTING") {
  route("GET", /\/batches\/b1$/, {
    body: {
      id: "b1",
      batchNo: "KP-2026-0915-A",
      status,
      product: { id: "p1", name: "Organik Pamuk Polo", gtin: "08691234567890" },
      chain: { approvedSteps: 1, totalSteps: 2, stepStatuses: [] },
      openIssues: { errors: 1, warnings: 2, infos: 0 },
      quantity: 1200,
      score: 74,
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-21T10:00:00Z",
    },
  });
  route("GET", /\/batches\/b1\/score$/, { body: { score: 74, threshold: 80, blockers: [], criteria: [], warnings: [] } });
  route("GET", /\/batches\/b1\/chain$/, {
    body: { steps: [step("s2", "YARN", "SUBMITTED", 2, 2), step("s1", "FIBER", "APPROVED", 1)] },
  });
}

beforeEach(() => {
  resetApi();
  signedInAs("ADMIN");
});

const handlers = { id: "b1", onBack: jest.fn(), onReview: jest.fn(), onShoot: jest.fn(), onOpenPassport: jest.fn() };

describe("BatchScreen", () => {
  it("shows the score against the threshold, the alerts and the steps, and opens a submitted one", async () => {
    serve();

    await renderScreen(<BatchScreen {...handlers} />);

    expect(await screen.findByText("Organik Pamuk Polo")).toBeTruthy();
    expect(screen.getByText(t("batch.threshold", { n: 80 }))).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(t("batch.blockers", { count: 1 }))).toBeTruthy();
    expect(screen.getByText(t("batchStatusChip.COLLECTING"))).toBeTruthy();
    expect(screen.getByText(t("batch.progress", { done: 1, total: 2 }))).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(`${t("batch.review")} · ${t("stepType.YARN")}`));
    expect(handlers.onReview).toHaveBeenCalledWith(expect.objectContaining({ id: "s2" }), expect.objectContaining({ id: "b1" }));

    await fireEvent.press(screen.getByText(t("batch.shoot")));
    expect(handlers.onShoot).toHaveBeenCalled();
  });

  it("offers the passport of a published batch instead of the camera", async () => {
    serve("PUBLISHED");

    await renderScreen(<BatchScreen {...handlers} />);

    await fireEvent.press(await screen.findByText(t("batch.openPassport")));
    expect(handlers.onOpenPassport).toHaveBeenCalled();
    expect(screen.queryByText(t("batch.shoot"))).toBeNull();
    expect(screen.getByText(t("batch.publishedNote"))).toBeTruthy();
  });

  it("says when the batch cannot be loaded", async () => {
    await renderScreen(<BatchScreen {...handlers} />);

    expect(await screen.findByText(t("batch.loadError"))).toBeTruthy();
  });
});
