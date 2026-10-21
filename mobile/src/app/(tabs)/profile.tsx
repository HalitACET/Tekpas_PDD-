import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCapture } from "@/lib/capture";
import { uploadQueue } from "@/lib/upload-queue";
import { ProfileScreen } from "@/screens/ProfileScreen";

export default function Profile() {
  const capture = useCapture();
  const queryClient = useQueryClient();
  // Nothing of the signed-out person stays on the phone: the pages not uploaded and the cached answers.
  return (
    <ProfileScreen
      onDiscardPages={() => {
        capture.reset();
        void uploadQueue.clear();
      }}
      onSignedOut={() => queryClient.clear()}
      onOpenQueue={() => router.push("/queue")}
    />
  );
}
