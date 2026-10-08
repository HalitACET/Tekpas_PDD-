"use client";

import { ProblemTypes } from "@tekpas/api-client";
import { Lock, Trash2 } from "lucide-react";
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
import { type ProductListItem, useDeleteProduct } from "@/lib/api/products";
import { ApiError } from "@/lib/api/request";
import { displayGtin } from "@/lib/format";

/**
 * Design v0.3 05 (blocked: the product has batches) and 06 (confirm). The list knows the batch count; if a
 * batch was added meanwhile, the API's 409 PRODUCT_HAS_BATCHES turns the confirmation into the blocked view.
 */
export function DeleteProductDialog({
  product,
  onClose,
}: {
  product: ProductListItem | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("products.delete");
  const router = useRouter();
  const remove = useDeleteProduct();
  const [blockedBy, setBlockedBy] = useState<number>();

  const batchCount = blockedBy ?? product?.batchCount ?? 0;
  const blocked = batchCount > 0;

  const close = () => {
    setBlockedBy(undefined);
    onClose();
  };

  const confirm = async () => {
    if (!product) return;
    try {
      await remove.mutateAsync(product.id);
      close();
    } catch (error) {
      if (error instanceof ApiError && error.hasType(ProblemTypes.conflict) && error.problem?.reason === "PRODUCT_HAS_BATCHES") {
        setBlockedBy(Math.max(product.batchCount, 1));
      } else {
        toast.error(t("failed"));
      }
    }
  };

  const Icon = blocked ? Lock : Trash2;
  return (
    <AlertDialog open={product !== undefined} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        {product && (
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
                  {blocked ? t("blockedBody", { count: batchCount }) : t("body")}
                </AlertDialogDescription>
                <span className="flex flex-col gap-0.5 rounded-md bg-popover-muted px-2.5 py-2 text-[13px]">
                  <span className="font-medium">{product.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{displayGtin(product.gtin)}</span>
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
                      router.push(`/batches?productId=${product.id}`);
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
