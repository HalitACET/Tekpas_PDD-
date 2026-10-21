import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCapture } from "@/lib/capture";
import { useAwaitingDocuments } from "@/lib/queries";
import { DocumentFormScreen } from "@/screens/DocumentFormScreen";

/** The form of a document: the one just photographed (its pages are still on the phone) or one from the task list. */
export default function DocumentForm() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const capture = useCapture();
  const awaiting = useAwaitingDocuments();
  const fromCapture = capture.documentId === id;
  const listed = awaiting.data?.find((d) => d.id === id);
  const batchNo = fromCapture ? capture.batch?.batchNo : listed?.batchNo;
  const stepType = fromCapture ? capture.step?.stepType : listed?.stepType;
  const supplierName = fromCapture ? capture.step?.supplierName : listed?.supplierName;
  const stepLine = stepType
    ? supplierName
      ? t("form.stepLine", { step: t(`stepType.${stepType}`), supplier: supplierName })
      : t(`stepType.${stepType}`)
    : undefined;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <DocumentFormScreen
      documentId={id}
      batchNo={batchNo}
      stepLine={stepLine}
      supplierName={supplierName}
      localPages={fromCapture ? capture.pages : undefined}
      onBack={back}
      onTasks={() => router.dismissTo("/")}
      onApproved={(approved) => {
        if (fromCapture) capture.reset();
        router.replace({
          pathname: "/document/approved",
          params: {
            docType: approved.docType,
            certNo: approved.certNo ?? "",
            supplierName: approved.supplierName ?? "",
            batchNo: approved.batchNo ?? "",
            validUntil: approved.validUntil ?? "",
          },
        });
      }}
    />
  );
}
