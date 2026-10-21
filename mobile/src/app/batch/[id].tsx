import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import { useCapture } from "@/lib/capture";
import { passportUrl } from "@/lib/scan";
import { BatchScreen } from "@/screens/BatchScreen";

export default function Batch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const capture = useCapture();
  return (
    <BatchScreen
      id={id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onReview={(step, batch) => router.push({ pathname: "/step/[id]", params: { id: step.id, batch: batch.id } })}
      onShoot={(batch) => {
        // The capture flow starts at its second step: the batch is known.
        capture.chooseBatch({ id: batch.id, batchNo: batch.batchNo, productName: batch.product.name });
        router.push("/capture/step");
      }}
      onOpenPassport={(batch) => void WebBrowser.openBrowserAsync(passportUrl(batch.product.gtin, batch.batchNo))}
    />
  );
}
