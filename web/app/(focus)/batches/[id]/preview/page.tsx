import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PassportPreviewPage } from "@/components/batches/passport/passport-pages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publishing");
  return { title: t("barPreviewTitle") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PassportPreviewPage batchId={id} />;
}
