import { router } from "expo-router";
import { NotificationDeniedScreen } from "@/screens/NotificationScreens";

export default function NotificationDenied() {
  return <NotificationDeniedScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
