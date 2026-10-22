import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslationEntry, TranslationField, TranslationsResponse } from "@/lib/api/translations";
import { ApiError } from "@/lib/api/request";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, isPending: false, isError: false, refetch: () => {} },
  suggest: { mutate: vi.fn(), isPending: false, isError: false, error: undefined as unknown },
  save: vi.fn(),
}));

vi.mock("@/lib/api/translations", () => ({
  usePassportTranslations: () => state.query,
  useSuggestTranslations: () => state.suggest,
  useSaveTranslations: () => ({ mutate: state.save, isPending: false }),
}));

import { TranslationsSection } from "./translations-section";

const entry = (language: string, over: Partial<TranslationEntry> = {}): TranslationEntry => ({
  language,
  text: null,
  aiSuggested: false,
  approved: false,
  stale: false,
  ...over,
});

const approved = { approved: true, approvedAt: "2026-10-21T09:00:00Z", approvedByName: "Elif Yılmaz" };

/** Design 140a: one of each state. */
const mixed: TranslationField[] = [
  {
    field: "product.description",
    kind: "PRODUCT_DESCRIPTION",
    source: "Yuvarlak yaka, kısa kollu basic tişört.",
    sourceLanguage: "tr",
    translations: [
      entry("en", { text: "Crew-neck, short-sleeved basic T-shirt.", aiSuggested: true, ...approved }),
      entry("de", { text: "Basic-T-Shirt mit Rundhalsausschnitt.", aiSuggested: true }),
    ],
  },
  {
    field: "product.care.note",
    kind: "CARE_NOTE",
    source: "Ters çevirerek yıkayın.",
    sourceLanguage: "tr",
    translations: [entry("en", { text: "Turn inside out before washing.", ...approved }), entry("de")],
  },
  {
    field: "step.f1.fabricType",
    kind: "FABRIC_TYPE",
    stepType: "FABRIC",
    source: "Süprem örme",
    sourceLanguage: "tr",
    translations: [entry("en", { text: "Single jersey", aiSuggested: true, stale: true }), entry("de", { text: "Single-Jersey-Strick", aiSuggested: true, ...approved })],
  },
];

function given(data: Partial<TranslationsResponse>) {
  state.query = { data: { aiAvailable: true, suggesting: false, fields: mixed, ...data }, isPending: false, isError: false, refetch: () => {} };
}

const show = (canEdit = true) => renderWithIntl(<TranslationsSection batchId="b1" canEdit={canEdit} />);
const row = (label: string) => screen.getByText(label, { selector: "strong" }).closest("div.grid") as HTMLElement;

beforeEach(() => {
  given({});
  state.suggest = { mutate: vi.fn(), isPending: false, isError: false, error: undefined };
  state.save = vi.fn();
});

describe("TranslationsSection (design v1.1 140)", () => {
  it("shows each text with its source and a box per other language in its state", () => {
    show();

    expect(screen.getByRole("heading", { name: "Çeviriler" })).toBeInTheDocument();
    expect(screen.getByText("3 alan · EN, DE")).toBeInTheDocument();
    expect(screen.getByText("Ürün adı, firma ve yer adları çevrilmez.")).toBeInTheDocument();

    const description = row("Ürün açıklaması");
    expect(within(description).getByText("TR · kaynak · Türkçe")).toBeInTheDocument();
    expect(within(description).getByText("Onaylı")).toBeInTheDocument();
    expect(within(description).getByText("AI önerisi · onaylayan Elif Yılmaz · 21 Eki 2026")).toBeInTheDocument();
    expect(within(description).getByText("AI önerisi")).toBeInTheDocument();
    expect(within(description).getByText("Onaylanmadan yayına girmez.")).toBeInTheDocument();

    const care = row("Bakım notu");
    expect(within(care).getByText("Elle yazıldı · Elif Yılmaz · yayına girer")).toBeInTheDocument();
    expect(within(care).getByText("Boş kalırsa pasaportta Türkçe görünür.")).toBeInTheDocument();
    expect(within(care).getByRole("textbox", { name: "Bakım notu · Almanca çeviri" })).toHaveAttribute("placeholder", "Çeviri yok");

    const fabric = row("Kumaş tipi");
    expect(within(fabric).getByText("Yeniden onay gerekir")).toBeInTheDocument();
    expect(within(fabric).getByText("Kaynak metin değişti. Onaylanana dek yeni sürüme girmez.")).toBeInTheDocument();
  });

  it("approves one box, or everything waiting at once", async () => {
    const user = userEvent.setup();
    show();

    await user.click(within(row("Ürün açıklaması")).getByRole("button", { name: "Onayla" }));
    expect(state.save).toHaveBeenLastCalledWith(
      [{ field: "product.description", language: "de", text: "Basic-T-Shirt mit Rundhalsausschnitt.", approved: true }],
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Tümünü onayla (2)" }));
    expect(state.save).toHaveBeenLastCalledWith(
      [
        { field: "product.description", language: "de", text: "Basic-T-Shirt mit Rundhalsausschnitt.", approved: true },
        { field: "step.f1.fabricType", language: "en", text: "Single jersey", approved: true },
      ],
      expect.anything(),
    );
  });

  it("saves a text written by hand as approved when the box is left, and an emptied one as removed", async () => {
    const user = userEvent.setup();
    show();

    const de = screen.getByRole("textbox", { name: "Bakım notu · Almanca çeviri" });
    await user.type(de, "  Auf links waschen. ");
    await user.tab();
    expect(state.save).toHaveBeenLastCalledWith([{ field: "product.care.note", language: "de", text: "Auf links waschen.", approved: true }], expect.anything());

    const en = screen.getByRole("textbox", { name: "Bakım notu · İngilizce çeviri" });
    await user.clear(en);
    await user.tab();
    expect(state.save).toHaveBeenLastCalledWith([{ field: "product.care.note", language: "en", text: null, approved: false }], expect.anything());
  });

  it("asks for suggestions and shows the boxes being prepared while it runs", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Çevirileri öner" }));
    expect(state.suggest.mutate).toHaveBeenCalled();

    given({ suggesting: true });
    show();
    expect(screen.getByRole("button", { name: "Öneriliyor…" })).toBeDisabled();
    // The empty and the unapproved AI boxes: description DE, care note DE.
    expect(screen.getAllByText("Öneri hazırlanıyor…")).toHaveLength(2);
  });

  it("says when today's AI limit is reached and stops offering suggestions", () => {
    state.suggest = { ...state.suggest, isError: true, error: new ApiError(409, { type: "urn:tekpas:problem:conflict", title: "Conflict", status: 409, reason: "AI_LIMIT_REACHED" } as never) };
    show();

    expect(screen.getByRole("alert")).toHaveTextContent("Bugünkü AI öneri sınırı doldu.");
    expect(screen.getByRole("button", { name: "Çevirileri öner" })).toBeDisabled();
  });

  it("offers no suggestions to a real company, only the note that writing or leaving empty is fine", () => {
    given({ aiAvailable: false });
    show();

    expect(screen.queryByRole("button", { name: "Çevirileri öner" })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Çeviriyi kendiniz yazabilir ya da boş bırakabilirsiniz");
    expect(screen.getByRole("textbox", { name: "Bakım notu · Almanca çeviri" })).toHaveAttribute("placeholder", "Almanca çeviriyi yazın");
  });

  it("lets a reader look but not change anything", () => {
    show(false);

    expect(screen.queryByRole("button", { name: /Onayla|Tümünü onayla|Çevirileri öner/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Bakım notu · Almanca çeviri" })).toHaveAttribute("readonly");
  });

  it("says when there is nothing to translate", () => {
    given({ fields: [] });
    show();

    expect(screen.getByText("Çevrilecek metin yok.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tümü/ })).not.toBeInTheDocument();
  });
});
