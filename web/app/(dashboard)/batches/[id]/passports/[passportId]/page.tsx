import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PassportVersionPage } from "@/components/batches/passport/passport-pages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publishing");
  return { title: t("versionsTab") };
}

export default async function Page({ params }: { params: Promise<{ id: string; passportId: string }> }) {
  const { id, passportId } = await params;
  return <PassportVersionPage batchId={id} passportId={passportId} />;
}
