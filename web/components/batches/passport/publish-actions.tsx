"use client";

import { Ban, Eye, ExternalLink, Lock, MoreHorizontal, Pencil, QrCode, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { GuardedButton } from "@/components/common/guarded-button";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { BatchResponse } from "@/lib/api/batches";
import type { ScoreResponse } from "@/lib/api/passports";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";
import { DraftDialog, WithdrawDialog } from "./draft-withdraw-dialogs";
import { PublishDialog } from "./publish-dialog";
import { useIssueText } from "./score-card";
import { useVersionFacts } from "./use-version-facts";

const MENU_BUTTON =
  "flex size-9 cursor-pointer items-center justify-center rounded-md border border-input bg-card text-muted-foreground outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft";

/**
 * The buttons of the batch header (design v0.6): "Önizle" and "Pasaportu yayınla" while the batch is not published
 * (the second one locked, with the reasons under it, until nothing blocks); "Pasaportu aç", "QR" and the more-menu
 * once it is. The menu has "Yeni sürüm (taslak)" and "Geri çek". OWNER and ADMIN publish, open a draft and withdraw;
 * everyone who can read previews. The server checks again.
 */
export function PublishActions({ batch, score }: { batch: BatchResponse; score: { data?: ScoreResponse; isPending: boolean } }) {
  const t = useTranslations("publishing");
  const tDetail = useTranslations("batches.detail");
  const issueText = useIssueText();
  const session = useSession();
  const reviewer = session.status === "authenticated" && (session.user.role === "OWNER" || session.user.role === "ADMIN");
  const [dialog, setDialog] = useState<"publish" | "draft" | "withdraw">();
  const published = batch.status === "PUBLISHED";
  const hasPassport = !!batch.passport && !batch.passport.withdrawn;
  const draftOpen = hasPassport && !published;
  const { live } = useVersionFacts(batch.id, hasPassport);

  const blocked = !score.data?.publishable;
  const reasons: { text: string; soft: boolean }[] = score.isPending
    ? [{ text: t("scoreComputing"), soft: true }]
    : (score.data?.blockers ?? []).map((b) => ({ text: issueText(b, score.data?.score, score.data?.threshold), soft: b.code === "SCORE_BELOW_THRESHOLD" }));
  const openHref = batch.passport ? `/01/${batch.product.gtin}/10/${batch.batchNo}` : undefined;

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t("moreActions")} className={MENU_BUTTON}>
        <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[236px]">
        <DropdownMenuItem disabled={!reviewer || draftOpen} onClick={() => setDialog("draft")} className="min-h-9 items-start gap-2 px-2 py-1.5 text-[13px]">
          <Pencil className="mt-0.5" strokeWidth={1.75} aria-hidden />
          <span className="flex flex-col">
            <span>{t("newDraft")}</span>
            <span className="text-[11px] text-muted-foreground">
              {draftOpen ? t("newDraftOpen", { version: (batch.passport?.version ?? 0) + 1 }) : t("newDraftSub", { version: batch.passport?.version ?? 0 })}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={!reviewer || !live} onClick={() => setDialog("withdraw")} className="h-9 px-2 text-[13px]">
          <Ban strokeWidth={1.75} aria-hidden />
          {t("withdraw")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[340px]">
      {published ? (
        <div className="flex gap-2">
          <a
            href={openHref}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "secondary" }), "flex-1 shadow-none")}
          >
            <ExternalLink strokeWidth={1.75} aria-hidden />
            {t("openPassport")}
          </a>
          <a href="#qr-card" className={cn(buttonVariants({ variant: "secondary" }), "px-3 shadow-none")}>
            <QrCode strokeWidth={1.75} aria-hidden />
            {t("qr")}
          </a>
          {menu}
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Link href={`/batches/${batch.id}/preview`} className={cn(buttonVariants({ variant: "secondary" }), "px-3 shadow-none")}>
              <Eye strokeWidth={1.75} aria-hidden />
              {t("preview")}
            </Link>
            <GuardedButton
              allowed={reviewer}
              variant="brand"
              tooltipAlign="end"
              className="flex-1 disabled:opacity-50"
              disabled={blocked || score.isPending}
              aria-describedby="publish-reasons"
              onClick={() => setDialog("publish")}
            >
              {blocked || !reviewer ? <Lock strokeWidth={2} aria-hidden /> : <Upload strokeWidth={1.75} aria-hidden />}
              {t("publish")}
            </GuardedButton>
            {draftOpen && menu}
          </div>
          {reviewer && reasons.length > 0 && (
            <ul id="publish-reasons" aria-label={tDetail("publishLocked")} className="m-0 flex list-none flex-col gap-[3px] p-0 text-xs leading-[1.4] text-muted-foreground">
              {reasons.map((r) => (
                <li key={r.text} className="flex gap-1.5">
                  <span className={`mt-[7px] size-1 shrink-0 rounded-full ${r.soft ? "bg-status-low-confidence" : "bg-status-rejected"}`} aria-hidden />
                  {r.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <PublishDialog batch={batch} score={score.data} open={dialog === "publish"} onClose={() => setDialog(undefined)} />
      <DraftDialog batchId={batch.id} version={batch.passport?.version ?? 0} open={dialog === "draft"} onClose={() => setDialog(undefined)} />
      <WithdrawDialog batchId={batch.id} passportId={live?.id} open={dialog === "withdraw"} onClose={() => setDialog(undefined)} />
    </div>
  );
}
