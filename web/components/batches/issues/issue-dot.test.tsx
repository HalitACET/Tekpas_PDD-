import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { renderWithIntl } from "@/test/render";
import { IssueDot } from "./issue-dot";

const dot = (errors: number, warnings: number, infos = 0) =>
  renderWithIntl(
    <TooltipProvider>
      <IssueDot counts={{ errors, warnings, infos }} />
    </TooltipProvider>,
  );

describe("IssueDot", () => {
  it("is red with the number of blocking alerts, which come before warnings", () => {
    dot(2, 3);

    const el = screen.getByLabelText("2 engelleyici uyarı");
    expect(el).toHaveTextContent("2");
    expect(el).toHaveClass("text-status-rejected-foreground");
  });

  it("is orange with the number of warnings when nothing blocks", () => {
    dot(0, 3);

    const el = screen.getByLabelText("3 uyarı, yayını durdurmaz");
    expect(el).toHaveClass("text-status-expiring-foreground");
  });

  it("shows nothing for info level alone or for no alert", () => {
    const info = dot(0, 0, 4);
    expect(info.container).toBeEmptyDOMElement();
    info.unmount();

    expect(dot(0, 0).container).toBeEmptyDOMElement();
  });
});
