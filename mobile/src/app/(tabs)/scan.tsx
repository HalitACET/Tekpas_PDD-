import { router, useIsFocused } from "expo-router";
import { ScanScreen } from "@/screens/ScanScreen";

// The camera runs only while the tab is in front.
export default function Scan() {
  const focused = useIsFocused();
  return (
    <ScanScreen
      focused={focused}
      onBatch={(batch) => router.push({ pathname: "/batch/[id]", params: { id: batch.id } })}
      onNotNow={() => router.navigate("/")}
    />
  );
}
