import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BatchesPage } from "@/components/batches/batches-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.batches");
  return { title: t("title") };
}

export default function Page() {
  // The product filter lives in the URL (?productId=, from "Partileri gör"); useSearchParams needs a boundary.
  return (
    <Suspense>
      <BatchesPage />
    </Suspense>
  );
}
