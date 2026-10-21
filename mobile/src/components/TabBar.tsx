import type { BottomTabBarProps } from "expo-router/js-tabs";
import { ListChecks, ScanLine, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/ui";
import { useTaskTotal } from "@/screens/TasksScreen";
import { useTheme } from "@/theme/theme";

const ICONS = { index: ListChecks, scan: ScanLine, profile: User } as const;
const LABELS = { index: "tabs.tasks", scan: "tabs.scan", profile: "tabs.profile" } as const;

/**
 * Design v0.8 tab bar: 64 pt over the bottom inset, Görevler with the open task count in brand red, "Tara · Yakında"
 * shown but closed until QR scanning arrives (M9), Profil.
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const total = useTaskTotal();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { paddingBottom: insets.bottom, height: 64 + insets.bottom, borderTopColor: colors.border, backgroundColor: colors.card }]}
    >
      {state.routes.map((route, index) => {
        const name = route.name as keyof typeof ICONS;
        const Icon = ICONS[name];
        if (!Icon) return null;
        const active = state.index === index;
        const off = name === "scan";
        const color = active ? colors.foreground : colors.mutedForeground;
        const badge = name === "index" && total ? total : undefined;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: off }}
            accessibilityLabel={badge ? `${t(LABELS[name])}, ${t("tabs.badge", { count: badge })}` : t(LABELS[name])}
            disabled={off}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!active && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={[styles.tab, { opacity: off ? 0.55 : 1 }]}
          >
            <View>
              <Icon size={26} color={color} strokeWidth={active ? 2.2 : 1.8} />
              {badge !== undefined && (
                <View style={[styles.badge, { backgroundColor: colors.brand }]}>
                  <T family="mono" weight="semi" size={12} style={{ color: colors.brandForeground }}>
                    {String(badge)}
                  </T>
                </View>
              )}
            </View>
            <T size={13} weight={active ? "semi" : "medium"} style={{ color }}>
              {t(LABELS[name])}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: 1 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, minHeight: 64 },
  badge: { position: "absolute", right: -12, top: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 999, alignItems: "center", justifyContent: "center" },
});
