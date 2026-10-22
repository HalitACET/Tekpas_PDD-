import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type CareForm, emptyCare } from "@/lib/products/product-form";
import { renderWithIntl } from "@/test/render";
import { CareSection } from "./care-section";

function Harness({ initial, published = 0, onValue }: { initial: CareForm; published?: number; onValue?: (v: CareForm) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <CareSection
      value={value}
      publishedBatchCount={published}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

describe("CareSection (design v1.0 120a–c)", () => {
  it("starts empty with the five groups and says the passport shows no section", () => {
    renderWithIntl(<Harness initial={emptyCare()} />);

    expect(screen.getByText("Bakım talimatı girilmedi")).toBeInTheDocument();
    expect(screen.getAllByRole("radiogroup").map((g) => g.getAttribute("aria-label"))).toEqual([
      "Yıkama",
      "Ağartma",
      "Kurutma",
      "Ütüleme",
      "Profesyonel",
    ]);
    expect(within(screen.getByRole("radiogroup", { name: "Yıkama" })).getAllByRole("radio")).toHaveLength(6);
    expect(screen.getAllByText("Seçilmedi")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "Temizle" })).not.toBeInTheDocument();
  });

  it("offers bars only for temperature washes and P, F, W, and names the choice", () => {
    let last: CareForm | undefined;
    renderWithIntl(<Harness initial={emptyCare()} onValue={(v) => (last = v)} />);
    const washing = screen.getByRole("radiogroup", { name: "Yıkama" });

    fireEvent.click(within(washing).getByRole("radio", { name: "40 °C" }));
    fireEvent.click(within(washing).getByRole("button", { name: "Hassas" }));

    expect(within(washing).getByRole("radio", { name: "40 °C" })).toHaveAttribute("aria-checked", "true");
    expect(within(washing).getByText("40 °C, hassas")).toBeInTheDocument();
    expect(last?.washing).toEqual({ symbol: "WASH_40", gentleness: "GENTLE" });

    // Hand wash takes no bars: the selector goes and the bars are dropped.
    fireEvent.click(within(washing).getByRole("radio", { name: "Elde yıkama" }));
    expect(within(washing).queryByRole("button", { name: "Hassas" })).not.toBeInTheDocument();
    expect(last?.washing).toEqual({ symbol: "HAND_WASH", gentleness: "NORMAL" });

    const professional = screen.getByRole("radiogroup", { name: "Profesyonel" });
    fireEvent.click(within(professional).getByRole("radio", { name: "Kuru temizleme P" }));
    expect(within(professional).getAllByRole("button", { name: /Normal|Hassas/ })).toHaveLength(2);
  });

  it("clears a group with Temizle or by choosing the same symbol again", () => {
    let last: CareForm | undefined;
    renderWithIntl(<Harness initial={{ ...emptyCare(), ironing: { symbol: "IRON_MEDIUM", gentleness: "NORMAL" } }} onValue={(v) => (last = v)} />);
    const ironing = screen.getByRole("radiogroup", { name: "Ütüleme" });

    fireEvent.click(within(ironing).getByRole("button", { name: "Temizle" }));
    expect(last?.ironing).toBeNull();
    fireEvent.click(within(ironing).getByRole("radio", { name: "Ütülenmez" }));
    fireEvent.click(within(ironing).getByRole("radio", { name: "Ütülenmez" }));
    expect(last?.ironing).toBeNull();
  });

  it("counts the note, keeps the language it is written in, and notes published batches", () => {
    let last: CareForm | undefined;
    renderWithIntl(<Harness initial={emptyCare()} published={2} onValue={(v) => (last = v)} />);

    expect(screen.getByRole("note")).toHaveTextContent("2 partisi yayında.");
    fireEvent.change(screen.getByLabelText("Bakım notu"), { target: { value: "Ters çevirerek yıkayın" } });

    expect(screen.getByText("22/200")).toBeInTheDocument();
    expect(last).toMatchObject({ note: "Ters çevirerek yıkayın", noteLanguage: "tr" });
    expect(screen.queryByText("Bakım talimatı girilmedi")).not.toBeInTheDocument();
  });
});
