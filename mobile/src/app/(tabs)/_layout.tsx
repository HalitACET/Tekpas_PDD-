import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect } from "react";
import { TabBar } from "@/components/TabBar";
import { notificationTarget, shouldExplain, syncPush } from "@/lib/notifications";

/**
 * The signed-in app. When it opens: this phone's push token is renewed, the notifications are explained once
 * (design v0.9 106a), and a notification the app was opened from leads to its screen.
 */
export default function TabsLayout() {
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    void syncPush();
    void shouldExplain().then((explain) => {
      if (explain) router.push("/notifications/ask");
    });
  }, []);

  useEffect(() => {
    if (!response) return;
    const target = notificationTarget(response.notification.request.content.data);
    void Notifications.clearLastNotificationResponseAsync();
    if (target && target !== "/") router.push(target as never);
  }, [response]);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
