import { useQueryClient } from "@tanstack/react-query";
import { useCapture } from "@/lib/capture";
import { ProfileScreen } from "@/screens/ProfileScreen";

export default function Profile() {
  const capture = useCapture();
  const queryClient = useQueryClient();
  // Nothing of the signed-out person stays on the phone: the pages not uploaded and the cached answers.
  return <ProfileScreen onDiscardPages={capture.reset} onSignedOut={() => queryClient.clear()} />;
}
