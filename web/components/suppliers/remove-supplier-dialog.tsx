"use client";

import { ProblemTypes } from "@tekpas/api-client";
import { Lock, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/request";
import { type SupplierResponse, useRemoveSupplier } from "@/lib/api/suppliers";

/**
 * Design v0.3.1 27 (blocked: used in batch chains) and 28 (confirm removing the link). The list knows the
 * batch count; if a chain started using the supplier meanwhile, the API's 409 SUPPLIER_IN_USE turns the
 * confirmation into the blocked view.
 */
export function RemoveSupplierDialog({
  supplier,
  onClose,
}: {
  supplier: SupplierResponse | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("suppliers.remove");
  const tType = useTranslations("enums.companyType");
  const router = useRouter();
  const remove = useRemoveSupplier();
  const [blockedBy, setBlockedBy] = useState<number>();

  const batchCount = blockedBy ?? supplier?.batchCount ?? 0;
  const blocked = batchCount > 0;

  const close = () => {
    setBlockedBy(undefined);
    onClose();
  };

  const confirm = async () => {
    if (!supplier) return;
    try {
      await remove.mutateAsync(supplier.id);
      close();
    } catch (error) {
      if (error instanceof ApiError && error.hasType(ProblemTypes.conflict) && error.problem?.reason === "SUPPLIER_IN_USE") {
        setBlockedBy(Math.max(supplier.batchCount, 1));
      } else {
        toast.error(t("failed"));
      }
    }
  };

  const Icon = blocked ? Lock : Unlink;
  return (
    <AlertDialog open={supplier !== undefined} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        {supplier && (
          <>
            <div className="flex gap-3.5 px-6 pt-6 pb-5">
              <span
                className={`flex size-10 flex-none items-center justify-center rounded-full ${
                  blocked
                    ? "bg-status-expiring-muted text-status-expiring-foreground"
                    : "bg-status-rejected-muted text-status-rejected-foreground"
                }`}
              >
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <AlertDialogTitle>{blocked ? t("blockedTitle") : t("title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {blocked ? t("blockedBody", { count: batchCount }) : t("body", { name: supplier.name })}
                </AlertDialogDescription>
                <span className="flex flex-col gap-0.5 rounded-md bg-popover-muted px-2.5 py-2 text-[13px]">
                  <span className="font-medium">{supplier.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[tType(supplier.type), supplier.city].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-[13px] leading-normal text-muted-foreground">
                  {blocked ? t("blockedNote") : t("note")}
                </span>
              </div>
            </div>
            <AlertDialogFooter>
              {blocked ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      close();
                      router.push(`/batches?supplierId=${supplier.id}`);
                    }}
                  >
                    {t("seeBatches")}
                  </Button>
                  <AlertDialogClose render={<Button />}>{t("close")}</AlertDialogClose>
                </>
              ) : (
                <>
                  <AlertDialogClose render={<Button variant="secondary" />}>{t("cancel")}</AlertDialogClose>
                  <Button variant="destructive" onClick={confirm} disabled={remove.isPending}>
                    {t("confirm")}
                  </Button>
                </>
              )}
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
