"use client";

import { useLocale, useTranslations } from "next-intl";
import type { BatchResponse } from "@/lib/api/batches";
import { formatQuantity, formatUpdated } from "@/lib/format";
import { BatchStatusChip, ChainProgress } from "./batch-status-chip";

/** Column template of design v0.3 07 (the last column held the row arrow, hidden until the detail, 09). */
export const BATCH_COLUMNS = "grid-cols-[170px_minmax(0,1fr)_180px_170px_140px_100px_40px]";

export function BatchesTableHeader() {
  const t = useTranslations("batches.cols");
  return (
    <div
      role="row"
      className={`grid h-9 items-center rounded-t-lg border-b bg-muted pr-1 pl-4 text-xs font-medium text-muted-foreground ${BATCH_COLUMNS}`}
    >
      <span role="columnheader">{t("batchNo")}</span>
      <span role="columnheader">{t("product")}</span>
      <span role="columnheader">{t("chain")}</span>
      <span role="columnheader">{t("status")}</span>
      <span role="columnheader">{t("score")}</span>
      <span role="columnheader">{t("updated")}</span>
      <span role="columnheader" />
    </div>
  );
}

export function BatchRow({ batch, now }: { batch: BatchResponse; now: Date }) {
  const t = useTranslations("batches");
  const locale = useLocale();
  const quantity = t("quantity", { quantity: formatQuantity(batch.quantity, locale) });

  return (
    <div
      role="row"
      className={`grid h-[52px] items-center border-b pr-1 pl-4 text-[13px] last:border-b-0 hover:bg-accent ${BATCH_COLUMNS}`}
    >
      <span role="cell" className="font-mono text-xs">
        {batch.batchNo}
      </span>
      <span role="cell" className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{batch.product.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {batch.productionOrderNo ? `${quantity} · ${batch.productionOrderNo}` : quantity}
        </span>
      </span>
      <span role="cell">
        <ChainProgress total={batch.chain.totalSteps} approved={batch.chain.approvedSteps} />
      </span>
      <span role="cell">
        <BatchStatusChip status={batch.status} />
      </span>
      <span role="cell" className="font-mono text-xs font-medium text-muted-foreground">
        {/* The compliance score arrives with passports (M6). */}
        <span aria-hidden>—</span>
        <span className="sr-only">{t("noScore")}</span>
      </span>
      <span role="cell" className="text-xs text-muted-foreground">
        <time dateTime={batch.updatedAt}>{formatUpdated(batch.updatedAt, now, locale, t("yesterday"))}</time>
      </span>
      <span role="cell" />
    </div>
  );
}
