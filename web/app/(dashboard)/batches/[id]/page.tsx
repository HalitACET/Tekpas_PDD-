import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BatchDetailPage } from "@/components/batches/batch-detail-page";

export async function generateMetadata(): Promise<Metadata> {
  // The batch number is only known in the browser (the API needs the in-memory session).
  const t = await getTranslations("pages.batches");
  return { title: t("title") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?step= and &open= (from the tasks page) are read with useSearchParams, which needs a boundary.
  return (
    <Suspense>
      <BatchDetailPage id={id} />
    </Suspense>
  );
}
