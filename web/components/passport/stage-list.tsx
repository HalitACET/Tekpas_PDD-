"use client";

import { Award, ChevronDown, Clock, Check, Droplet, Grid3x3, Package, Shirt, Spool, Sprout, Tag } from "lucide-react";
import { type ReactNode, useState } from "react";

export interface StageInput {
  firm?: string;
  place?: string;
  facts: { key: string; label: string; value: string }[];
  certificates: string[];
  /** Preview only: a step that should hold a certificate but has none yet. */
  noCertificate: boolean;
}

export interface StageView {
  id: string;
  type: "FIBER" | "YARN" | "FABRIC" | "DYEING" | "SEWING" | "ACCESSORY" | "PACKAGING";
  stage: string;
  title: string;
  /** Shown while the card is closed. */
  summary: string;
  /** "2 girdi, kumaşta birleşir" for parallel inputs. */
  merge?: string;
  inputs: StageInput[];
  /** "Onaylandı · 20 Eyl" or, in a preview, "Onay bekliyor · pasaporta girmeyecek". */
  approvalText: string;
  pending: boolean;
  open: boolean;
}

const ICONS = {
  FIBER: Sprout,
  YARN: Spool,
  FABRIC: Grid3x3,
  DYEING: Droplet,
  SEWING: Shirt,
  ACCESSORY: Tag,
  PACKAGING: Package,
} as const;

/**
 * The supply chain as a vertical timeline (design v0.6, İzlenebilirlik): each stage is a card that opens to its firm,
 * its facts, its certificates and who approved it when. Cards are buttons (aria-expanded), 56 px tall at least, so a
 * thumb can use them; the first one (or the one where inputs merge) starts open. The last item is the product itself.
 */
export function StageList({
  stages,
  productLine,
  noCertificateText,
}: {
  stages: StageView[];
  productLine: string;
  noCertificateText: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(stages.map((s) => [s.id, s.open])));
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {stages.map((stage) => {
        const Icon = ICONS[stage.type];
        const isOpen = open[stage.id] ?? false;
        return (
          <li key={stage.id} className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex size-10 flex-none items-center justify-center rounded-full border bg-card ${
                  stage.pending ? "border-dashed border-input text-muted-foreground" : "border-story-line text-foreground"
                }`}
              >
                <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
              </span>
              <span className="min-h-3 w-[1.5px] flex-1 bg-story-line" aria-hidden />
            </div>
            <div className="min-w-0 pb-3.5">
              <div className={`rounded-xl border bg-card ${stage.pending ? "border-dashed" : "border-story-border"}`}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((all) => ({ ...all, [stage.id]: !isOpen }))}
                  className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{stage.stage}</span>
                      {stage.merge && <span className="text-xs font-medium text-brand-text">{stage.merge}</span>}
                    </span>
                    <span className="text-base font-semibold tracking-[-0.01em]">{stage.title}</span>
                    {!isOpen && <span className="text-sm text-muted-foreground">{stage.summary}</span>}
                  </span>
                  <ChevronDown
                    className={`size-[18px] flex-none text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-3 px-3.5 pb-3.5">
                    {stage.inputs.map((input, i) => (
                      <div
                        key={i}
                        className={`flex flex-col gap-2.5 ${stage.merge ? "border-l-2 border-story-line py-0.5 pl-3" : ""}`}
                      >
                        {input.firm && (
                          <span className="flex flex-col">
                            <span className="text-[15px] font-medium">{input.firm}</span>
                            {input.place && <span className="text-sm text-muted-foreground">{input.place}</span>}
                          </span>
                        )}
                        <Facts facts={input.facts} />
                        {input.noCertificate && input.certificates.length === 0 && (
                          <span className="flex h-[26px] items-center self-start rounded-md border border-dashed border-input px-[9px] text-[13px] text-muted-foreground">
                            {noCertificateText}
                          </span>
                        )}
                        {input.certificates.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {input.certificates.map((name) => (
                              <span key={name} className="inline-flex h-[26px] items-center gap-[5px] rounded-md border px-[9px] text-[13px] font-medium">
                                <Award className="size-[13px] text-status-approved" strokeWidth={2} aria-hidden />
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <span className={`flex items-center gap-1.5 text-[13px] ${stage.pending ? "text-muted-foreground" : "text-status-approved-foreground"}`}>
                      {stage.pending ? <Clock className="size-3.5" strokeWidth={2} aria-hidden /> : <Check className="size-3.5" strokeWidth={2} aria-hidden />}
                      {stage.approvalText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
      <li className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <Package className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="text-[15px] font-medium">{productLine}</span>
      </li>
    </ol>
  );
}

function Facts({ facts }: { facts: { key: string; label: string; value: string }[] }): ReactNode {
  if (facts.length === 0) return null;
  return (
    <dl className="m-0 grid grid-cols-[fit-content(45%)_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-sm">
      {facts.map((fact) => (
        <div key={fact.key} className="contents">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="m-0">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
