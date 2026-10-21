import { Redirect, router } from "expo-router";
import { useCapture } from "@/lib/capture";
import { StepPickScreen } from "@/screens/capture/PickScreens";

export default function CaptureStep() {
  const capture = useCapture();
  if (!capture.batch) return <Redirect href="/capture" />;
  return (
    <StepPickScreen
      batch={capture.batch}
      onBack={() => router.back()}
      onPick={(step) => {
        capture.chooseStep(step);
        router.push("/capture/camera");
      }}
    />
  );
}
