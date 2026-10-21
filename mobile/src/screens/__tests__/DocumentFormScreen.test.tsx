import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import i18n from "@/lib/i18n";
import type { DocumentResponse } from "@/lib/queries";
import { calls, renderScreen, resetApi, route, signedInAs, testSession as mockSession } from "@/test/render";
import { DocumentFormScreen, proposed, validate } from "../DocumentFormScreen";

// Read when a screen renders, after the imports: jest allows a factory to use names starting with "mock".
jest.mock("@/lib/use-session", () => ({ useSession: () => mockSession.state }));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

function document(overrides: Partial<DocumentResponse> = {}): DocumentResponse {
  return {
    id: "d1",
    docType: "UNKNOWN",
    extractionStatus: "READ",
    extractionMethod: "LLM",
    originalName: "foto.pdf",
    mimeType: "application/pdf",
    pageCount: 2,
    rereadable: false,
    reviewStatus: "UNREVIEWED",
    sizeBytes: 1000,
    source: "PANEL",
    extraction: {
      detectedType: "GOTS",
      method: "LLM",
      warnings: [],
      fields: {
        certNo: { value: "CU 1047823", confidence: 0.96, source: "LLM" },
        holderName: { value: "Ege İplik", confidence: 0.74, source: "LLM" },
        validUntil: { value: "2027-03-13", confidence: 0.9, source: "LLM" },
      },
    },
    ...overrides,
  } as DocumentResponse;
}

const props = { documentId: "d1", batchNo: "KP-2026-0915-A", onBack: jest.fn(), onTasks: jest.fn() };

beforeEach(() => {
  resetApi();
  signedInAs("OWNER");
});

describe("proposed and validate", () => {
  it("takes the reading's values with their source and confidence", () => {
    const values = proposed(document());
    expect(values.docType).toEqual({ value: "GOTS", source: "ai" });
    expect(values.holderName).toEqual({ value: "Ege İplik", source: "ai", confidence: 0.74 });
    expect(values.issuer).toEqual({ value: "", source: "none" });
  });

  it("asks a certificate for its number and end of validity, in order", () => {
    const values = proposed(document({ extraction: undefined }));
    expect(validate(values)).toEqual({ docType: "form.requiredType" });

    const gots = { ...values, docType: { value: "GOTS" as const, source: "user" as const } };
    expect(validate(gots)).toEqual({ certNo: "form.requiredCertNo", validUntil: "form.requiredValidUntil" });

    const backwards = {
      ...gots,
      certNo: { value: "X1", source: "user" as const },
      validFrom: { value: "2027-01-01", source: "user" as const },
      validUntil: { value: "2026-01-01", source: "user" as const },
    };
    expect(validate(backwards)).toEqual({ validUntil: "form.dateOrder" });
  });
});

describe("DocumentFormScreen", () => {
  it("marks a value under 80 % yellow and approves the person's values", async () => {
    route("GET", /\/documents\/d1$/, { body: document() });
    route("POST", /\/documents\/d1\/verify$/, { body: document({ reviewStatus: "VERIFIED" }) });
    const onApproved = jest.fn();

    await renderScreen(<DocumentFormScreen {...props} supplierName="Ege İplik" onApproved={onApproved} />);

    expect(await screen.findByText(t("form.sourceAi", { pct: 74 }))).toBeTruthy();
    expect(screen.getAllByText(t("form.check"))).toHaveLength(1);
    expect(screen.getByText(t("form.summary", { count: 3, low: 1 }))).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(t("form.holder")), "Ege İplik A.Ş.");
    expect(screen.queryByText(t("form.check"))).toBeNull();
    await fireEvent.press(screen.getByText(t("form.approve")));

    await waitFor(() => expect(onApproved).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      docType: "GOTS",
      certNo: "CU 1047823",
      holderName: "Ege İplik A.Ş.",
      issuer: null,
      validFrom: null,
      validUntil: "2027-03-13",
    });
    expect(onApproved.mock.calls[0][0]).toMatchObject({ docType: "GOTS", certNo: "CU 1047823", batchNo: "KP-2026-0915-A" });
  });

  it("does not send a certificate without its number", async () => {
    route("GET", /\/documents\/d1$/, {
      body: document({ extractionStatus: "UNREADABLE", extraction: undefined, docType: "GOTS" }),
    });

    await renderScreen(<DocumentFormScreen {...props} onApproved={jest.fn()} />);

    expect(await screen.findByText(t("form.manualTitle"))).toBeTruthy();
    await fireEvent.press(screen.getByText(t("form.approve")));

    expect(screen.getByText(t("form.missing", { count: 2 }))).toBeTruthy();
    expect(screen.getByText(t("form.requiredCertNo"))).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("tells that someone else approved the document meanwhile", async () => {
    route("GET", /\/documents\/d1$/, { body: document() });
    route("POST", /\/documents\/d1\/verify$/, { status: 409, body: { status: 409, reason: "DOCUMENT_VERIFIED" } });

    await renderScreen(<DocumentFormScreen {...props} onApproved={jest.fn()} />);
    await screen.findByText(t("form.sourceAi", { pct: 74 }));
    await fireEvent.press(screen.getByText(t("form.approve")));

    expect(await screen.findByText(t("form.conflictTitle"))).toBeTruthy();
  });

  it("leaves the approval to an admin for an editor, and the fields closed for a viewer", async () => {
    route("GET", /\/documents\/d1$/, { body: document() });
    signedInAs("EDITOR");

    const { unmount } = await renderScreen(<DocumentFormScreen {...props} onApproved={jest.fn()} />);
    expect(await screen.findByText(t("form.editorNote"))).toBeTruthy();
    expect(screen.queryByText(t("form.approve"))).toBeNull();
    await unmount();

    signedInAs("VIEWER");
    await renderScreen(<DocumentFormScreen {...props} onApproved={jest.fn()} />);
    expect(await screen.findByText(t("form.viewerNote"))).toBeTruthy();
    expect(screen.queryByLabelText(t("form.holder"))).toBeNull();
  });
});
