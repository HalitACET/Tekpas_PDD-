import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invitation");
  return {
    title: t("metaTitle"),
    // A link with a secret in it: never indexed, never passed on as a referrer.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default function InvitationLayout({ children }: { children: ReactNode }) {
  return children;
}
