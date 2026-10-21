import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCapture } from "@/lib/capture";
import { CameraScreen } from "@/screens/capture/CameraScreen";

/**
 * The first visit goes on to the review; from the review, "Sayfa ekle" (mode=add) and "Yeniden çek" (replace=n) come
 * back to it.
 */
export default function CaptureCamera() {
  const capture = useCapture();
  const { mode, replace } = useLocalSearchParams<{ mode?: string; replace?: string }>();
  if (!capture.step) return <Redirect href="/capture" />;
  const replacing = replace !== undefined ? Number(replace) : undefined;
  return (
    <CameraScreen
      pageCount={capture.pages.length}
      lastPage={capture.pages.at(-1)}
      replacing={replacing}
      onPage={(page) => (replacing !== undefined ? capture.replacePage(replacing, page) : capture.addPage(page))}
      onDone={() => (mode === "add" || replacing !== undefined ? router.back() : router.replace("/capture/review"))}
      onClose={() => router.back()}
    />
  );
}
