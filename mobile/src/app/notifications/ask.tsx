import { router } from "expo-router";
import { NotificationAskScreen } from "@/screens/NotificationScreens";

export default function NotificationAsk() {
  return (
    <NotificationAskScreen
      onDone={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onDenied={() => router.replace("/notifications/denied")}
    />
  );
}
