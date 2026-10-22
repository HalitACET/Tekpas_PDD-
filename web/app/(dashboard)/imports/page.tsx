import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ImportsPage } from "@/components/imports/imports-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.imports");
  return { title: t("title") };
}

export default function Page() {
  return (
    <Suspense>
      <ImportsPage />
    </Suspense>
  );
}
