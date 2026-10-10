import type { StepStatus, StepType } from "@tekpas/shared";

/*
 * Fixed layout of design v0.3 09: five columns (Lif → İplik → Kumaş → Boya → Konfeksiyon), 176 × 132 nodes,
 * 228 px from column to column. A column's nodes are stacked 156 px apart around the same middle line; the
 * canvas grows when a column holds more than two. No layout library: the chain's shape is the column order.
 */

/** The step types the chain view draws, in column order (ACCESSORY and PACKAGING are not drawn yet). */
export const DRAWN_STEP_TYPES = ["FIBER", "YARN", "FABRIC", "DYEING", "SEWING"] as const satisfies readonly StepType[];
export type DrawnStepType = (typeof DRAWN_STEP_TYPES)[number];

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 132;
export const COLUMN_PITCH = 228;
export const ROW_PITCH = 156;
/** Nodes start below the column labels. */
export const NODES_TOP = 28;
/** A lone node sits this far below NODES_TOP, level with the middle of two stacked ones. */
const SINGLE_OFFSET = ROW_PITCH / 2;
export const CANVAS_WIDTH = COLUMN_PITCH * (DRAWN_STEP_TYPES.length - 1) + NODE_WIDTH;
export const MIN_CANVAS_HEIGHT = NODES_TOP + ROW_PITCH + NODE_HEIGHT;

export interface LayoutStep {
  id: string;
  stepType: StepType;
  status: StepStatus;
  inputStepIds: readonly string[];
  /** A supplier is assigned, or (FIBER) the origin is recorded. */
  filled: boolean;
}

export interface LayoutNode<S extends LayoutStep> {
  step: S;
  column: number;
  x: number;
  y: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  /** The target has nobody assigned yet: drawn dashed. */
  toEmpty: boolean;
}

export interface ChainLayout<S extends LayoutStep> {
  nodes: LayoutNode<S>[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export function isDrawn(type: StepType): type is DrawnStepType {
  return (DRAWN_STEP_TYPES as readonly StepType[]).includes(type);
}

/** Steps arrive in chain order; within a column they keep that order from top to bottom. */
export function layoutChain<S extends LayoutStep>(steps: readonly S[]): ChainLayout<S> {
  const drawn = steps.filter((s) => isDrawn(s.stepType));
  const columns = DRAWN_STEP_TYPES.map((type) => drawn.filter((s) => s.stepType === type));

  const offsets = columns.map((column) =>
    column.map((_, i) => SINGLE_OFFSET + (i - (column.length - 1) / 2) * ROW_PITCH),
  );
  const top = Math.min(0, ...offsets.flat());

  const nodes = columns.flatMap((column, c) =>
    column.map((step, i) => ({ step, column: c, x: c * COLUMN_PITCH, y: NODES_TOP + offsets[c][i] - top })),
  );
  const byId = new Map(nodes.map((n) => [n.step.id, n]));
  const edges = nodes.flatMap((node) =>
    node.step.inputStepIds
      .filter((input) => byId.has(input))
      .map((input) => ({
        id: `${input}->${node.step.id}`,
        source: input,
        target: node.step.id,
        toEmpty: !node.step.filled,
      })),
  );
  const bottom = Math.max(0, ...nodes.map((n) => n.y + NODE_HEIGHT));
  return { nodes, edges, width: CANVAS_WIDTH, height: Math.max(MIN_CANVAS_HEIGHT, bottom) };
}

/**
 * The legend shows the statuses a step can have (09); "Reddedildi" only while a step is rejected (v0.3.1 29).
 * The design's "AI güveni düşük" and "Süresi doluyor" come with documents (M5).
 */
export function legendStatuses(statuses: readonly StepStatus[]): StepStatus[] {
  return (["APPROVED", "SUBMITTED", "REJECTED", "PENDING"] as const).filter(
    (s) => s !== "REJECTED" || statuses.includes("REJECTED"),
  );
}
