import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@/theme/theme";

/** Design v0.9 106f: a 52×32 track in a 60×44 touch area; green when on. */
export function Switch({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.area, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View
        style={[
          styles.track,
          { backgroundColor: value ? colors.status.approved.dot : colors.input, justifyContent: value ? "flex-end" : "flex-start" },
        ]}
      >
        <View style={styles.knob} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: { width: 60, height: 44, alignItems: "center", justifyContent: "center" },
  track: { width: 52, height: 32, borderRadius: 999, padding: 3, flexDirection: "row" },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
