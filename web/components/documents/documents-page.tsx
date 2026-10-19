"use client";

import { useState } from "react";
import { PageView } from "@/components/shell/page-view";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { UploadDocumentDialog } from "./upload-dialog";

/**
 * The documents page is still design G's empty frame (the company-wide list comes later); "Belge yükle" asks for
 * the batch and step and uploads there. "Tedarikçiden iste" stays "coming soon".
 */
export function DocumentsPage() {
  const session = useSession();
  const canWrite = session.status === "authenticated" && canWriteCatalog(session.user.role);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageView page="documents" onCta={() => setOpen(true)} ctaAllowed={canWrite} />
      <UploadDocumentDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
