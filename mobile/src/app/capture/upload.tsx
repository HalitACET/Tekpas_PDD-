import { Redirect, router } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapture } from "@/lib/capture";
import { queueCapture } from "@/lib/queue-capture";
import { UploadScreen } from "@/screens/capture/UploadScreen";

export default function CaptureUpload() {
  const { t } = useTranslation();
  const capture = useCapture();
  const { uploaded } = capture;
  const onUploaded = useCallback((document: { id: string }) => uploaded(document.id), [uploaded]);
  // "Yükle" opens this screen: the acceptance time (docs/m8-plan.md §5) runs from here to the filled form.
  const [started] = useState(() => Date.now());
  const onDone = useCallback(
    (id: string, filled: boolean) => {
      // The capture flow is over: back to the tasks, and the form on top of them.
      router.dismissTo("/");
      router.push({ pathname: "/document/[id]", params: filled ? { id, ms: String(Date.now() - started) } : { id } });
    },
    [started],
  );
  if (!capture.batch || !capture.step || capture.pages.length === 0) return <Redirect href="/capture" />;
  const type = capture.docType ? t(`docType.${capture.docType}`) : t(`stepType.${capture.step.stepType}`);
  return (
    <UploadScreen
      stepId={capture.step.id}
      title={t("upload.summary", { type, count: capture.pages.length })}
      subtitle={capture.batch.batchNo}
      pages={capture.pages}
      docType={capture.docType}
      onUploaded={onUploaded}
      onDone={onDone}
      onCancel={() => router.back()}
      onQueue={() =>
        void queueCapture(capture).then((id) => router.replace({ pathname: "/capture/queued", params: { id } }))
      }
    />
  );
}
