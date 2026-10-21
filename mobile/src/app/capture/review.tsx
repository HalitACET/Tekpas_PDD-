import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCapture } from "@/lib/capture";
import { queueCapture } from "@/lib/queue-capture";
import { useUploadQueue } from "@/lib/use-upload-queue";
import { ReviewScreen } from "@/screens/capture/ReviewScreen";

export default function CaptureReview() {
  const { t } = useTranslation();
  const capture = useCapture();
  const { online } = useUploadQueue();
  if (!capture.batch || !capture.step) return <Redirect href="/capture" />;
  return (
    <ReviewScreen
      subtitle={`${capture.batch.batchNo} · ${t(`stepType.${capture.step.stepType}`)}`}
      pages={capture.pages}
      docType={capture.docType}
      onBack={() => router.back()}
      onAdd={() => router.push({ pathname: "/capture/camera", params: { mode: "add" } })}
      onRetake={(index) => router.push({ pathname: "/capture/camera", params: { replace: String(index) } })}
      onRemove={capture.removePage}
      onSwap={capture.swapPages}
      onType={capture.setDocType}
      onUpload={() => router.push("/capture/upload")}
      offline={!online}
      onQueue={() =>
        void queueCapture(capture).then((id) => router.replace({ pathname: "/capture/queued", params: { id } }))
      }
    />
  );
}
