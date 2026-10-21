import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCapture } from "@/lib/capture";
import { pendingCount, useUploadQueue } from "@/lib/use-upload-queue";
import { QueuedScreen } from "@/screens/QueueScreens";

export default function CaptureQueued() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const capture = useCapture();
  const queue = useUploadQueue();
  const item = queue.items.find((i) => i.id === id);
  if (!item) return <Redirect href="/" />;
  return (
    <QueuedScreen
      item={item}
      waiting={pendingCount(queue)}
      onTasks={() => router.dismissTo("/")}
      onAnother={() => {
        capture.reset();
        router.replace("/capture");
      }}
    />
  );
}
