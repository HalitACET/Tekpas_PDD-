import { router } from "expo-router";
import { useCapture } from "@/lib/capture";
import { BatchPickScreen } from "@/screens/capture/PickScreens";

export default function CaptureBatch() {
  const capture = useCapture();
  return (
    <BatchPickScreen
      onClose={() => router.back()}
      onPick={(batch) => {
        capture.chooseBatch(batch);
        router.push("/capture/step");
      }}
    />
  );
}
