import { router } from "expo-router";
import { uploadQueue } from "@/lib/upload-queue";
import { useUploadQueue } from "@/lib/use-upload-queue";
import { QueueScreen } from "@/screens/QueueScreens";

export default function Queue() {
  const queue = useUploadQueue();
  return (
    <QueueScreen
      queue={queue}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onRetry={(id) => uploadQueue.retryNow(id)}
      onRemove={(id) => void uploadQueue.remove(id)}
    />
  );
}
