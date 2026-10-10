import type { StepStatus, StepType } from "@tekpas/shared";
import { describe, expect, it } from "vitest";
import { CANVAS_WIDTH, layoutChain, legendStatuses, type LayoutStep, MIN_CANVAS_HEIGHT } from "./chain-layout";

const step = (id: string, stepType: StepType, inputs: string[] = [], filled = true, status: StepStatus = "PENDING") =>
  ({ id, stepType, status, inputStepIds: inputs, filled }) satisfies LayoutStep;

describe("layoutChain", () => {
  it("places the design's chain (09): two yarns stacked around the middle line of the others", () => {
    const layout = layoutChain([
      step("lif", "FIBER"),
      step("ip1", "YARN", ["lif"]),
      step("ip2", "YARN", ["lif"]),
      step("kum", "FABRIC", ["ip1", "ip2"]),
      step("boy", "DYEING", ["kum"]),
      step("kon", "SEWING", ["boy"], false),
    ]);

    expect(layout.nodes.map((n) => [n.step.id, n.x, n.y])).toEqual([
      ["lif", 0, 106],
      ["ip1", 228, 28],
      ["ip2", 228, 184],
      ["kum", 456, 106],
      ["boy", 684, 106],
      ["kon", 912, 106],
    ]);
    expect(layout.edges.map((e) => `${e.id}${e.toEmpty ? " dashed" : ""}`)).toEqual([
      "lif->ip1",
      "lif->ip2",
      "ip1->kum",
      "ip2->kum",
      "kum->boy",
      "boy->kon dashed",
    ]);
    expect([layout.width, layout.height]).toEqual([1088, 316]);
  });

  it("grows the canvas when a column holds three steps, keeping the others level with its middle", () => {
    const layout = layoutChain([
      step("lif", "FIBER"),
      step("a", "YARN", ["lif"]),
      step("b", "YARN", ["lif"]),
      step("c", "YARN", ["lif"]),
      step("kum", "FABRIC", ["a", "b", "c"]),
    ]);

    const y = Object.fromEntries(layout.nodes.map((n) => [n.step.id, n.y]));
    expect([y.a, y.b, y.c]).toEqual([28, 184, 340]);
    expect(y.lif).toBe(y.b);
    expect(y.kum).toBe(y.b);
    expect(layout.height).toBe(340 + 132);
  });

  it("draws only the five column types and drops edges to steps it does not draw", () => {
    const layout = layoutChain([step("lif", "FIBER"), step("acc", "ACCESSORY", ["lif"]), step("kon", "SEWING", ["acc"])]);

    expect(layout.nodes.map((n) => n.step.id)).toEqual(["lif", "kon"]);
    expect(layout.edges).toEqual([]);
  });

  it("keeps the design's canvas for an empty chain", () => {
    expect(layoutChain([])).toEqual({ nodes: [], edges: [], width: CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT });
  });
});

describe("legendStatuses", () => {
  it("shows Reddedildi only while a step is rejected (v0.3.1 29)", () => {
    expect(legendStatuses(["APPROVED", "PENDING"])).toEqual(["APPROVED", "SUBMITTED", "PENDING"]);
    expect(legendStatuses(["REJECTED"])).toEqual(["APPROVED", "SUBMITTED", "REJECTED", "PENDING"]);
  });
});
