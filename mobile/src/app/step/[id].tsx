import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { type ChainResponse, useBatch, useChain } from "@/lib/queries";
import { CorrectionSentScreen, StepApprovedScreen, StepReviewScreen } from "@/screens/StepScreen";

/**
 * A submitted step: from the task list, a batch summary or a notification (/step/{id}?batch={batchId}). The review
 * ends on the approval or on sending the correction's new link; both go back to the tasks.
 */
export default function Step() {
  const { id, batch: batchId } = useLocalSearchParams<{ id: string; batch?: string }>();
  const batch = useBatch(batchId ?? "");
  const chain = useChain(batchId ?? "");
  const [outcome, setOutcome] = useState<{ kind: "approved"; chain: ChainResponse } | { kind: "sent"; reason: string }>();
  const step = chain.data?.steps.find((s) => s.id === id);
  const tasks = () => router.dismissTo("/");

  if (outcome?.kind === "approved" && step && batch.data) {
    return <StepApprovedScreen step={step} batchNo={batch.data.batchNo} chain={outcome.chain} onTasks={tasks} />;
  }
  if (outcome?.kind === "sent" && step && batch.data) {
    return <CorrectionSentScreen step={step} batch={batch.data} reason={outcome.reason} onTasks={tasks} />;
  }
  const loading = !!batchId && (batch.isPending || chain.isPending);
  return (
    <StepReviewScreen
      step={step}
      batch={batch.data}
      loading={loading}
      failed={batch.error ?? chain.error ?? undefined}
      onRetry={() => {
        void batch.refetch();
        void chain.refetch();
      }}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onOpenDocument={(documentId) => router.push({ pathname: "/document/[id]", params: { id: documentId } })}
      onApproved={(next) => setOutcome({ kind: "approved", chain: next })}
      onRejected={(reason) => setOutcome({ kind: "sent", reason })}
      onTasks={tasks}
    />
  );
}
