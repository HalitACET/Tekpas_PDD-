import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Heading, T } from "@/components/ui";
import { useTheme } from "@/theme/theme";

/**
 * Design v0.9 101g–101h, 106a–106b: why we ask for a permission, or how to turn it back on (numbered steps). The
 * buttons go in the screen's BottomBar.
 */
export function Permission({
  icon: Icon,
  denied = false,
  tone = "neutral",
  title,
  body,
  steps,
  children,
}: {
  icon: LucideIcon;
  denied?: boolean;
  tone?: "neutral" | "submitted";
  title: string;
  body: string;
  steps?: string[];
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const bg = denied ? colors.status.rejected.muted : tone === "submitted" ? colors.status.submitted.muted : colors.muted;
  const fg = denied ? colors.status.rejected.fg : tone === "submitted" ? colors.status.submitted.fg : colors.foreground;
  return (
    <View style={styles.page}>
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Icon size={34} color={fg} strokeWidth={1.8} />
      </View>
      <Heading size={32}>{title}</Heading>
      <T size={17} style={{ lineHeight: 25 }}>
        {body}
      </T>
      {steps && (
        <View style={[styles.steps, { backgroundColor: colors.muted }]}>
          {steps.map((line, i) => (
            <T key={line} size={16} style={{ lineHeight: 27 }}>
              {`${i + 1}. ${line}`}
            </T>
          ))}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", gap: 16, paddingHorizontal: 28 },
  icon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  steps: { padding: 16, borderRadius: 12 },
});
