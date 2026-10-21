import * as Notifications from "expo-notifications";
import { Bell, ChevronRight } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/components/ui";
import { notificationTarget } from "@/lib/notifications";
import { useTheme } from "@/theme/theme";

/** How long the banner stays (design v0.9 106e: the bar empties in this time). */
export const BANNER_MS = 4000;

interface Shown {
  id: string;
  title: string;
  body: string;
  target?: string;
}

/**
 * Design v0.9 106e: a notification that arrives while the app is in front shows here instead of the system's banner
 * (configureNotifications); a tap opens what it is about.
 */
export function NotificationBanner({ onOpen }: { onOpen: (target: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Shown>();
  // Made once; the animation drives it outside of React.
  const [progress] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      setShown({
        id: notification.request.identifier,
        title: content.title ?? "",
        body: content.body ?? "",
        target: notificationTarget(content.data),
      });
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!shown) return;
    progress.setValue(1);
    const run = Animated.timing(progress, { toValue: 0, duration: BANNER_MS, easing: Easing.linear, useNativeDriver: false });
    run.start(({ finished }) => {
      if (finished) setShown(undefined);
    });
    return () => run.stop();
  }, [shown, progress]);

  if (!shown) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("notifications.open")}: ${shown.title}`}
        accessibilityLiveRegion="polite"
        onPress={() => {
          setShown(undefined);
          if (shown.target) onOpen(shown.target);
        }}
        style={[styles.card, { backgroundColor: colors.popover, borderColor: colors.border }]}
      >
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.status.submitted.muted }]}>
            <Bell size={22} color={colors.status.submitted.fg} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T size={16} weight="semi">
              {shown.title}
            </T>
            <T size={15} style={{ lineHeight: 20 }}>
              {shown.body}
            </T>
          </View>
          <ChevronRight size={22} color={colors.mutedForeground} />
        </View>
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          <Animated.View
            style={{
              height: "100%",
              backgroundColor: colors.status.submitted.dot,
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 10, right: 10, zIndex: 10 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 8 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  track: { height: 3 },
});
