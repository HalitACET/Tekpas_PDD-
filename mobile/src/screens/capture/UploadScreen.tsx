import { AlertTriangle, Check, RefreshCw } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, BottomBar, Button, T } from "@/components/ui";
import type { Page } from "@/lib/capture";
import { type DocType, type DocumentResponse, type UploadResult, uploadPhotos, waitForReading } from "@/lib/documents";
import { formatSize } from "@/lib/format";
import { useTheme } from "@/theme/theme";

type Phase =
  | { kind: "uploading"; progress: number }
  | { kind: "reading"; started: number; slow: boolean }
  | { kind: "failed"; progress: number }
  | { kind: "refused"; result: Extract<UploadResult, { ok: false }> };

/** The words for the server's refusal of an upload (409, 413, 415, 400 on a page, 403). */
function refusal(t: ReturnType<typeof useTranslation>["t"], result: Extract<UploadResult, { ok: false }>): string {
  if (result.reason === "BATCH_PUBLISHED") return t("upload.published");
  if (result.reason === "DOCUMENT_LIMIT") return t("upload.limit");
  if (result.reason === "DUPLICATE_DOCUMENT") return t("upload.duplicate");
  if (result.status === 413) return t("upload.tooLarge");
  if (result.status === 403) return t("upload.forbidden");
  const page = result.field?.match(/^pages\[(\d+)]$/);
  if (page) return t("upload.badPage", { n: Number(page[1]) + 1 });
  return t("errors.other");
}

/**
 * Design v0.8 97a–97d: two stages, the upload with its percentage and then the reading; after 20 seconds the reading
 * may be left for the form ("Elle doldur", the result is added when it comes); a lost connection keeps the pages on the
 * phone for "Tekrar dene". The form opens by itself when the reading is over.
 */
export function UploadScreen({
  stepId,
  title,
  subtitle,
  pages,
  docType,
  onUploaded,
  onDone,
  onCancel,
  upload = uploadPhotos,
  wait = waitForReading,
}: {
  stepId: string;
  title: string;
  subtitle: string;
  pages: Page[];
  docType?: DocType;
  onUploaded: (document: DocumentResponse) => void;
  /** filled: the reading is over (not "Elle doldur", not given up). */
  onDone: (documentId: string, filled: boolean) => void;
  onCancel: () => void;
  upload?: typeof uploadPhotos;
  wait?: typeof waitForReading;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: "uploading", progress: 0 });
  const [seconds, setSeconds] = useState(0);
  const [documentId, setDocumentId] = useState<string>();
  const abort = useRef<AbortController>(undefined);
  const bytes = pages.reduce((sum, p) => sum + p.bytes, 0);

  const start = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let progress = 0;
    const result = await upload(stepId, pages, {
      docType,
      signal: controller.signal,
      onProgress: (fraction) => {
        progress = fraction;
        setPhase({ kind: "uploading", progress: fraction });
      },
    });
    if (controller.signal.aborted) return;
    if (!result.ok) {
      setPhase(result.status ? { kind: "refused", result } : { kind: "failed", progress });
      return;
    }
    setDocumentId(result.document.id);
    onUploaded(result.document);
    setPhase({ kind: "reading", started: Date.now(), slow: false });
    const read = await wait(result.document.id, {
      signal: controller.signal,
      onSlow: () => setPhase((p) => (p.kind === "reading" ? { ...p, slow: true } : p)),
    });
    if (!controller.signal.aborted) onDone(read?.id ?? result.document.id, !!read);
  }, [docType, onDone, onUploaded, pages, stepId, upload, wait]);

  useEffect(() => {
    // The upload is a request to the server; its state changes come back from it, after the first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
    return () => abort.current?.abort();
    // The upload starts once, when the screen opens; "Tekrar dene" starts it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase.kind !== "reading") return;
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - phase.started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const percent = (fraction: number) => Math.round(fraction * 100);
  const reading = phase.kind === "reading";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.page}>
        <View style={styles.summary}>
          {pages[0] && <Image source={{ uri: pages[0].uri }} style={[styles.thumb, { borderColor: colors.border }]} accessibilityIgnoresInvertColors />}
          <View style={{ gap: 4, flex: 1 }}>
            <T size={18} weight="semi">
              {title}
            </T>
            <T size={14} family="mono" weight="medium" tone="muted">
              {subtitle}
            </T>
          </View>
        </View>

        <View accessibilityRole="progressbar" accessibilityValue={phase.kind === "uploading" ? { min: 0, max: 100, now: percent(phase.progress) } : undefined}>
          <Stage
            n={1}
            state={phase.kind === "uploading" ? "run" : phase.kind === "failed" || phase.kind === "refused" ? "err" : "done"}
            title={
              phase.kind === "uploading"
                ? t("upload.uploading")
                : phase.kind === "failed"
                  ? t("upload.failedStage", { pct: percent(phase.progress) })
                  : phase.kind === "refused"
                    ? t("upload.refusedTitle")
                    : t("upload.uploaded")
            }
            value={phase.kind === "uploading" ? `%${percent(phase.progress)}` : undefined}
            bar={phase.kind === "uploading" ? phase.progress : undefined}
            sub={
              phase.kind === "uploading"
                ? `${formatSize(bytes * phase.progress)} / ${formatSize(bytes)}`
                : t("upload.uploadedSub", { count: pages.length, size: formatSize(bytes) })
            }
          />
          <Stage
            n={2}
            last
            state={reading ? "run" : "wait"}
            title={reading ? (phase.slow ? t("upload.readingSeconds", { n: seconds }) : t("upload.reading")) : t("upload.readingWait")}
            sub={reading ? (phase.slow ? t("upload.stillRunning") : t("upload.readingSub")) : t("upload.waitSub")}
          />
        </View>

        {reading && phase.slow && <Banner kind="lowConfidence" title={t("upload.slowTitle")} body={t("upload.slowBody")} />}
        {phase.kind === "failed" && (
          <Banner kind="rejected" icon={AlertTriangle} title={t("upload.failedTitle")} body={t("upload.failedBody", { count: pages.length })} />
        )}
        {phase.kind === "refused" && (
          <Banner
            kind="rejected"
            icon={AlertTriangle}
            title={t("upload.refusedTitle")}
            body={refusal(t, phase.result)}
            meta={phase.result.requestId ? t("errors.metaWithId", { status: phase.result.status, id: phase.result.requestId }) : t("errors.meta", { status: phase.result.status })}
          />
        )}
      </View>
      <BottomBar border={false}>
        {reading && phase.slow && documentId && <Button label={t("upload.manual")} onPress={() => onDone(documentId, false)} />}
        {phase.kind === "failed" && (
          <Button
            label={t("common.retry")}
            variant="brand"
            icon={RefreshCw}
            onPress={() => {
              setPhase({ kind: "uploading", progress: 0 });
              void start();
            }}
          />
        )}
        <Button
          label={phase.kind === "failed" || phase.kind === "refused" ? t("common.giveUp") : t("common.cancel")}
          variant="secondary"
          height={52}
          onPress={() => {
            abort.current?.abort();
            onCancel();
          }}
        />
      </BottomBar>
    </SafeAreaView>
  );
}

function Stage({
  n,
  state,
  title,
  value,
  bar,
  sub,
  last = false,
}: {
  n: number;
  state: "wait" | "run" | "done" | "err";
  title: string;
  value?: string;
  bar?: number;
  sub: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const dotBg = state === "done" ? colors.status.approved.dot : state === "err" ? colors.status.rejected.dot : state === "run" ? colors.foreground : "transparent";
  return (
    <View style={{ flexDirection: "row", gap: 14 }}>
      <View style={{ width: 32, alignItems: "center" }}>
        <View style={[styles.dot, { backgroundColor: dotBg, borderWidth: state === "wait" ? 2 : 0, borderColor: colors.input }]}>
          {state === "done" ? (
            <Check size={18} color={colors.background} strokeWidth={2.6} />
          ) : state === "run" ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <T family="mono" weight="semi" size={14} style={{ color: state === "err" ? colors.background : colors.mutedForeground }}>
              {String(n)}
            </T>
          )}
        </View>
        {!last && <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: colors.border }} />}
      </View>
      <View style={{ flex: 1, gap: 8, paddingTop: 4, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <T size={18} weight="semi" tone={state === "wait" ? "muted" : state === "err" ? "danger" : "default"}>
            {title}
          </T>
          {value && (
            <T family="mono" weight="medium" size={16}>
              {value}
            </T>
          )}
        </View>
        {bar !== undefined && (
          <View style={[styles.track, { backgroundColor: colors.muted }]}>
            <View style={{ width: `${Math.round(bar * 100)}%`, height: "100%", backgroundColor: colors.foreground, borderRadius: 999 }} />
          </View>
        )}
        <T size={15} tone="muted">
          {sub}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", gap: 28, paddingHorizontal: 24 },
  summary: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: { width: 56, height: 72, borderRadius: 8, borderWidth: 1 },
  dot: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  track: { height: 8, borderRadius: 999, overflow: "hidden" },
});
