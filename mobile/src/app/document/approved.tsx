import { router, useLocalSearchParams } from "expo-router";
import { useCapture } from "@/lib/capture";
import type { DocType } from "@/lib/documents";
import { SuccessScreen } from "@/screens/SuccessScreen";

export default function DocumentApproved() {
  const capture = useCapture();
  const params = useLocalSearchParams<{ docType: DocType; certNo?: string; supplierName?: string; batchNo?: string; validUntil?: string }>();
  return (
    <SuccessScreen
      approved={{
        docType: params.docType,
        certNo: params.certNo || undefined,
        supplierName: params.supplierName || undefined,
        batchNo: params.batchNo || undefined,
        validUntil: params.validUntil || undefined,
      }}
      onTasks={() => router.dismissTo("/")}
      onAnother={() => {
        capture.reset();
        router.replace("/capture");
      }}
    />
  );
}
