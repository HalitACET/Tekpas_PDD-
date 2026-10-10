"use client";

import "@xyflow/react/dist/base.css";
import type { Fiber, StepStatus, StepType } from "@tekpas/shared";
import { type Edge, type EdgeProps, Handle, type Node, type NodeProps, Position, ReactFlow } from "@xyflow/react";
import { FileText, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { StepStatusBadge } from "@/components/common/step-status-badge";
import type { ChainStep } from "@/lib/api/batches";
import {
  DRAWN_STEP_TYPES,
  layoutChain,
  legendStatuses,
  type LayoutStep,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "@/lib/batches/chain-layout";

/*
 * Supply chain of design v0.3 09 (v0.3.1 29 for a rejected step): React Flow draws the nodes and edges at the
 * fixed positions of lib/batches/chain-layout.ts; nothing can be dragged, zoomed or connected. Clicking a
 * node opens its panel with PR 3b.
 */

/** What a node shows: the supplier, or for FIBER the recorded origin (fibre and region). */
export interface ChainNodeStep extends LayoutStep {
  stepType: StepType;
  status: StepStatus;
  name?: string;
  city?: string;
  documentCount: number;
}

export function toNodeStep(step: ChainStep, fiberName: (fiber: Fiber) => string): ChainNodeStep {
  const fiber = step.stepType === "FIBER" ? step.data.fiberType : undefined;
  const name = step.supplier?.name ?? (fiber ? fiberName(fiber) : undefined);
  const city = step.supplier ? (step.supplier.city ?? undefined) : (step.data.originRegion ?? undefined);
  return {
    id: step.id,
    stepType: step.stepType,
    status: step.status,
    inputStepIds: step.inputStepIds,
    filled: name !== undefined,
    name,
    city,
    documentCount: step.documentCount,
  };
}

const STATUS_DOT: Record<StepStatus, string> = {
  APPROVED: "bg-status-approved",
  SUBMITTED: "bg-status-submitted",
  REJECTED: "bg-status-rejected",
  PENDING: "bg-status-pending",
};

export function ChainLegend({ statuses }: { statuses: readonly StepStatus[] }) {
  const t = useTranslations("batches.chain");
  const tStatus = useTranslations("enums.stepStatus");
  return (
    <ul aria-label={t("legend")} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {legendStatuses(statuses).map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
          {tStatus(status)}
        </li>
      ))}
    </ul>
  );
}

type StepNode = Node<{ step: ChainNodeStep }, "step">;
type StepEdge = Edge<{ x1: number; y1: number; x2: number; y2: number; toEmpty: boolean }, "chain">;

const HANDLE = "!min-h-0 !min-w-0 !size-px !border-0 !bg-transparent";

function StepNodeView({ data: { step } }: NodeProps<StepNode>) {
  const t = useTranslations("batches.chain");
  const tStep = useTranslations("enums.stepType");
  const label = tStep(step.stepType);
  const handles = (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} className={HANDLE} />
      <Handle type="source" position={Position.Right} isConnectable={false} className={HANDLE} />
    </>
  );

  if (!step.filled) {
    return (
      <div
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
        className="flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-input p-3 text-center text-muted-foreground"
      >
        {handles}
        <span className="flex size-8 items-center justify-center rounded-full border border-input" aria-hidden>
          <Plus className="size-4" strokeWidth={1.75} />
        </span>
        <span className="text-[13px] font-medium text-foreground">{t("emptyNode")}</span>
        <span className="text-[11px]">{t("emptyNodeBody", { step: label })}</span>
      </div>
    );
  }

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`flex flex-col gap-1 rounded-[10px] border bg-card p-3 shadow-xs ${
        step.status === "REJECTED" ? "border-status-rejected" : "border-border"
      }`}
    >
      {handles}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</span>
        <span className="flex items-center gap-[3px] font-mono text-[11px] text-muted-foreground">
          <FileText className="size-3" strokeWidth={1.75} aria-hidden />
          <span aria-hidden>{step.documentCount}</span>
          <span className="sr-only">{t("documents", { count: step.documentCount })}</span>
        </span>
      </div>
      <strong className="mt-1 truncate text-sm font-semibold tracking-[-0.01em]">{step.name}</strong>
      {step.city && <span className="truncate text-xs text-muted-foreground">{step.city}</span>}
      <span className="mt-auto">
        <StepStatusBadge status={step.status} size="sm" />
      </span>
    </div>
  );
}

/** A curve from the source's right edge to just before the target's left edge, with a dot at the end (09). */
function ChainEdgeView({ data }: EdgeProps<StepEdge>) {
  if (!data) return null;
  const { x1, y1, x2, y2, toEmpty } = data;
  const m = (x1 + x2) / 2;
  const colour = toEmpty ? "var(--input)" : "var(--muted-foreground)";
  return (
    <g>
      <path
        d={`M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}`}
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        strokeDasharray={toEmpty ? "4 4" : undefined}
      />
      <circle cx={x2} cy={y2} r={3} fill={colour} />
    </g>
  );
}

const nodeTypes = { step: StepNodeView };
const edgeTypes = { chain: ChainEdgeView };

export function SupplyChainCanvas({ steps }: { steps: readonly ChainNodeStep[] }) {
  const t = useTranslations("batches.chain");
  const tStep = useTranslations("enums.stepType");
  const layout = useMemo(() => layoutChain(steps), [steps]);

  const nodes = useMemo<StepNode[]>(
    () =>
      layout.nodes.map((n) => ({
        id: n.step.id,
        type: "step",
        position: { x: n.x, y: n.y },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: { step: n.step },
        draggable: false,
        selectable: false,
        focusable: false,
      })),
    [layout],
  );
  const edges = useMemo<StepEdge[]>(() => {
    const at = new Map(layout.nodes.map((n) => [n.step.id, n]));
    return layout.edges.map((e) => {
      const source = at.get(e.source)!;
      const target = at.get(e.target)!;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "chain",
        selectable: false,
        focusable: false,
        data: {
          x1: source.x + NODE_WIDTH,
          y1: source.y + NODE_HEIGHT / 2,
          x2: target.x - 4,
          y2: target.y + NODE_HEIGHT / 2,
          toEmpty: e.toEmpty,
        },
      };
    });
  }, [layout]);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card p-6">
      <div role="group" aria-label={t("label")} className="relative" style={{ width: layout.width, height: layout.height }}>
        {DRAWN_STEP_TYPES.map((type, i) => (
          <span
            key={type}
            className="absolute top-0 flex items-baseline gap-2 text-xs font-semibold"
            style={{ left: i * 228 }}
            aria-hidden
          >
            <span className="font-mono text-[11px] font-medium text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            {tStep(type)}
          </span>
        ))}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          className="!bg-transparent"
        />
      </div>
    </div>
  );
}
