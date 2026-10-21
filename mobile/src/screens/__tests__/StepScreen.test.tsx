import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import i18n from "@/lib/i18n";
import type { BatchResponse, ChainStep } from "@/lib/queries";
import { calls, renderScreen, resetApi, route, signedInAs, testSession as mockSession } from "@/test/render";
import { CorrectionSentScreen, StepApprovedScreen, StepReviewScreen } from "../StepScreen";

// Read when a screen renders, after the imports: jest allows a factory to use names starting with "mock".
jest.mock("@/lib/use-session", () => ({ useSession: () => mockSession.state }));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
const now = new Date("2026-10-21T15:00:00");

const step = {
  id: "s2",
  stepType: "YARN",
  status: "SUBMITTED",
  sortOrder: 2,
  documentCount: 1,
  unreviewedDocumentCount: 1,
  inputStepIds: [],
  updatedAt: "2026-10-21T11:32:00Z",
  supplier: { id: "sup1", name: "Ege İplik", type: "YARN" },
  submission: { name: "Mehmet Kaya", at: "2026-10-21T14:32:00", code: "7HQ2" },
  data: { fiberComposition: [{ fiber: "ORGANIC_COTTON", percent: 100 }], yarnCount: "Ne 30/1", deliveredKg: 1200 },
} as unknown as ChainStep;
const batch = { id: "b1", batchNo: "KP-2026-0915-A", product: { id: "p1", name: "Polo", gtin: "08691234567890" } } as BatchResponse;
const chainAfter = { steps: [{ ...step, status: "APPROVED" }, { ...step, id: "s1", stepType: "FIBER", status: "PENDING", sortOrder: 1 }] };

const handlers = {
  loading: false,
  onRetry: jest.fn(),
  onBack: jest.fn(),
  onOpenDocument: jest.fn(),
  onApproved: jest.fn(),
  onRejected: jest.fn(),
  onTasks: jest.fn(),
};

beforeEach(() => {
  resetApi();
  signedInAs("ADMIN");
  jest.clearAllMocks();
  route("GET", /\/steps\/s2\/documents$/, {
    body: [{ id: "d1", docType: "GOTS", pageCount: 3, issuer: "Control Union", extractionStatus: "READ", reviewStatus: "UNREVIEWED" }],
  });
});

describe("StepReviewScreen", () => {
  it("shows what the supplier sent and approves it", async () => {
    route("POST", /\/steps\/s2\/approve$/, { body: chainAfter });

    await renderScreen(<StepReviewScreen {...handlers} step={step} batch={batch} now={now} />);

    expect(screen.getByText(t("step.who", { name: "Mehmet Kaya", when: t("step.today", { time: "14:32" }) }))).toBeTruthy();
    expect(screen.getByText("%100")).toBeTruthy();
    expect(screen.getByText("1.200 kg")).toBeTruthy();
    expect(await screen.findByText("3 sayfa · Control Union")).toBeTruthy();

    await fireEvent.press(screen.getByText(t("step.approve")));
    await waitFor(() => expect(handlers.onApproved).toHaveBeenCalledWith(chainAfter));
  });

  it("sends a correction only with a reason, a ready one added to the text", async () => {
    route("POST", /\/steps\/s2\/reject$/, { body: chainAfter });

    await renderScreen(<StepReviewScreen {...handlers} step={step} batch={batch} now={now} />);
    await fireEvent.press(screen.getByText(t("step.reject")));
    await fireEvent.press(screen.getByText(t("rejectSheet.send")));
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await fireEvent.press(screen.getByText(t("rejectSheet.FIBER_MISMATCH")));
    await fireEvent.changeText(
      screen.getByLabelText(t("rejectSheet.reason")),
      `${t("rejectSheet.FIBER_MISMATCH")}. Güncel belgeyi ekleyin.`,
    );
    await fireEvent.press(screen.getByText(t("rejectSheet.send")));

    await waitFor(() => expect(handlers.onRejected).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      reason: `${t("rejectSheet.FIBER_MISMATCH")}. Güncel belgeyi ekleyin.`,
      fields: [],
    });
  });

  it("tells that someone else reviewed the data meanwhile", async () => {
    route("POST", /\/steps\/s2\/approve$/, { status: 409, body: { status: 409, reason: "STEP_NOT_SUBMITTED" } });

    await renderScreen(<StepReviewScreen {...handlers} step={step} batch={batch} now={now} />);
    await fireEvent.press(screen.getByText(t("step.approve")));

    expect(await screen.findByText(t("step.conflictTitle"))).toBeTruthy();
    expect(handlers.onApproved).not.toHaveBeenCalled();
  });

  it("leaves the decision to an owner or admin", async () => {
    signedInAs("EDITOR");

    await renderScreen(<StepReviewScreen {...handlers} step={step} batch={batch} now={now} />);

    expect(screen.getByText(t("step.lockedNote"))).toBeTruthy();
    expect(screen.queryByText(t("step.approve"))).toBeNull();
  });
});

describe("StepApprovedScreen", () => {
  it("tells how far the batch got and what is left", async () => {
    await renderScreen(
      <StepApprovedScreen step={step} batchNo="KP-2026-0915-A" chain={chainAfter as never} onTasks={jest.fn()} />,
    );

    expect(screen.getByText(t("approved.progress", { done: 1, total: 2 }))).toBeTruthy();
    expect(screen.getByText(t("approved.remaining", { steps: t("stepType.FIBER") }))).toBeTruthy();
  });
});

describe("CorrectionSentScreen", () => {
  it("makes a new link and sends it on WhatsApp straight to the supplier's number", async () => {
    route("GET", /\/suppliers\/sup1$/, { body: { id: "sup1", name: "Ege İplik", phone: "+905324182607" } });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const create = jest.fn(async () => ({
      id: "r1",
      code: "7HQ2",
      token: "tok123456",
      createdAt: "2026-10-21T15:00:00Z",
      expiresAt: "2026-10-28T15:00:00Z",
      validDays: 7,
    }));

    await renderScreen(<CorrectionSentScreen step={step} batch={batch} reason="Oran uyuşmuyor." onTasks={jest.fn()} create={create} />);

    expect(await screen.findByText("+90 532 418 26 07")).toBeTruthy();
    expect(await screen.findByText("kozapass.vercel.app/r#tok1…")).toBeTruthy();
    await fireEvent.press(screen.getByText(t("sent.whatsapp")));

    const url = open.mock.calls[0][0];
    expect(url.startsWith("https://wa.me/905324182607?text=")).toBe(true);
    const text = decodeURIComponent(url.split("text=")[1]);
    expect(text).toContain("Oran uyuşmuyor.");
    expect(text).toContain("https://kozapass.vercel.app/r#tok123456");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("names the supplier's contact person as the recipient and greets them (M10 T3)", async () => {
    route("GET", /\/suppliers\/sup1$/, {
      body: { id: "sup1", name: "Ege İplik", phone: "+905324182607", contactName: "Ayşe Demir" },
    });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const create = jest.fn(async () => ({
      id: "r1",
      code: "7HQ2",
      token: "tok123456",
      createdAt: "2026-10-21T15:00:00Z",
      expiresAt: "2026-10-28T15:00:00Z",
      validDays: 7,
    }));

    await renderScreen(<CorrectionSentScreen step={step} batch={batch} reason="Oran uyuşmuyor." onTasks={jest.fn()} create={create} />);

    expect(await screen.findByText("Ayşe Demir · Ege İplik")).toBeTruthy();
    expect(await screen.findByText("kozapass.vercel.app/r#tok1…")).toBeTruthy();
    await fireEvent.press(screen.getByText(t("sent.whatsapp")));
    const text = decodeURIComponent(open.mock.calls[0][0].split("text=")[1]);
    expect(text.startsWith("Merhaba Ayşe Demir, ")).toBe(true);
  });

  it("offers to make the link again when it could not be made", async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce({ id: "r1", code: "C", token: "tokABCD", createdAt: "", expiresAt: "2026-10-28T15:00:00Z", validDays: 7 });

    await renderScreen(<CorrectionSentScreen step={step} batch={batch} reason="x" onTasks={jest.fn()} create={create} />);

    expect(await screen.findByText(t("sent.failedTitle"))).toBeTruthy();
    await fireEvent.press(screen.getByText(t("sent.retry")));
    expect(await screen.findByText("kozapass.vercel.app/r#tokA…")).toBeTruthy();
  });
});
