import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginScreen } from "@/components/login/login-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default function LoginPage() {
  return <LoginScreen />;
}
