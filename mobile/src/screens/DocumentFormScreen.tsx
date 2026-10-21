import { AlertCircle, Calendar, Check, ChevronLeft, ChevronRight, Info, Lock, Sparkles, ZoomIn } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, BottomBar, Button, Sheet, T, TopBar } from "@/components/ui";
import type { Page } from "@/lib/capture";
import { CERTIFICATE_TYPES, type DocType, readingDone } from "@/lib/documents";
import { formatDate, locale } from "@/lib/format";
import { ApiError, type DocumentResponse, useDocument, useVerifyDocument } from "@/lib/queries";
import { useSession } from "@/lib/use-session";
import { fonts } from "@/theme/fonts";
import { useTheme } from "@/theme/theme";

type Source = "ai" | "rule" | "user" | "none";
interface FieldState {
  value: string;
  source: Source;
  confidence?: number;
}
type Key = "certNo" | "holderName" | "issuer" | "validFrom" | "validUntil";
type Values = Record<Key, FieldState> & { docType: { value: DocType | ""; source: Source } };

const CONFIDENT = 0.8;
const KEYS: Key[] = ["certNo", "holderName", "issuer", "validFrom", "validUntil"];
const DATE_KEYS: Key[] = ["validFrom", "validUntil"];
const LABEL: Record<Key, string> = {
  certNo: "form.certNo",
  holderName: "form.holder",
  issuer: "form.issuer",
  validFrom: "form.validFrom",
  validUntil: "form.validUntil",
};
const ALL_TYPES: DocType[] = ["GOTS", "OEKO_TEX", "GRS", "BCI", "OCS", "BLUESIGN", "LAB_REPORT", "SDS", "INVOICE", "TECH_SHEET", "OTHER"];

/** What the reading proposes, field by field, with where each value came from and how sure it is. */
export function proposed(doc: DocumentResponse): Values {
  const fields = doc.extraction?.fields;
  const fromReading = (key: Key): FieldState => {
    const field = fields?.[key];
    if (field) return { value: field.value, source: field.source === "LLM" ? "ai" : "rule", confidence: field.confidence };
    const saved = doc[key];
    return saved ? { value: String(saved), source: "rule" } : { value: "", source: "none" };
  };
  const detected = doc.extraction?.detectedType;
  const docType: Values["docType"] =
    doc.docType !== "UNKNOWN"
      ? { value: doc.docType, source: "user" }
      : detected && detected !== "UNKNOWN"
        ? { value: detected, source: doc.extraction?.method === "LLM" ? "ai" : "rule" }
        : { value: "", source: "none" };
  return {
    docType,
    certNo: fromReading("certNo"),
    holderName: fromReading("holderName"),
    issuer: fromReading("issuer"),
    validFrom: fromReading("validFrom"),
    validUntil: fromReading("validUntil"),
  };
}

/** Required fields by the server's rule: a type, and for a certificate its number and end of validity. */
export function validate(values: Values): Partial<Record<Key | "docType", string>> {
  const errors: Partial<Record<Key | "docType", string>> = {};
  if (!values.docType.value) errors.docType = "form.requiredType";
  if (values.docType.value && CERTIFICATE_TYPES.includes(values.docType.value as DocType)) {
    if (!values.certNo.value.trim()) errors.certNo = "form.requiredCertNo";
    if (!values.validUntil.value) errors.validUntil = "form.requiredValidUntil";
  }
  if (values.validFrom.value && values.validUntil.value && values.validUntil.value < values.validFrom.value) {
    errors.validUntil = "form.dateOrder";
  }
  return errors;
}

export interface Approved {
  docType: DocType;
  certNo?: string;
  supplierName?: string | null;
  batchNo?: string;
  validUntil?: string;
}

/**
 * Design v0.8 98–99f: the pages, where the document belongs, then every field with its source ("AI okudu · %74",
 * "Kural okudu", "Siz girdiniz") and the yellow of a value under 80 %. OWNER and ADMIN approve; EDITOR and VIEWER see
 * the form read-only, the approval is an admin's. A document someone else approved meanwhile shows that (409).
 */
export function DocumentFormScreen({
  documentId,
  batchNo,
  stepLine,
  supplierName,
  localPages,
  onBack,
  onApproved,
  onTasks,
  timingMs,
}: {
  documentId: string;
  batchNo?: string;
  stepLine?: string;
  supplierName?: string | null;
  localPages?: Page[];
  onBack: () => void;
  onApproved: (approved: Approved) => void;
  onTasks: () => void;
  /** Development builds only: from "Yükle" to this filled form, for the acceptance measurement. */
  timingMs?: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useSession();
  const role = session.status === "authenticated" ? session.user.role : undefined;
  const canApprove = role === "OWNER" || role === "ADMIN";
  const document = useDocument(documentId);
  const verify = useVerifyDocument(documentId);
  const [edits, setEdits] = useState<Partial<Values>>({});
  const [errors, setErrors] = useState<Partial<Record<Key | "docType", string>>>({});
  const [dateFor, setDateFor] = useState<Key>();
  const [typeSheet, setTypeSheet] = useState(false);
  const [conflictError, setConflictError] = useState(false);

  const doc = document.data;
  // What the reading proposes, with the person's own entries on top: a reading that ends while the form is open
  // ("Elle doldur") fills the fields the person has not touched.
  const values = useMemo<Values | undefined>(() => (doc ? { ...proposed(doc), ...edits } : undefined), [doc, edits]);
  const conflict = conflictError || (doc?.reviewStatus === "VERIFIED" && !verify.isSuccess);

  const set = (key: Key, value: string) => setEdits((e) => ({ ...e, [key]: { value, source: "user" } }));

  const approve = () => {
    if (!values) return;
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = {
      docType: values.docType.value as DocType,
      certNo: values.certNo.value.trim() || null,
      holderName: values.holderName.value.trim() || null,
      issuer: values.issuer.value.trim() || null,
      validFrom: values.validFrom.value || null,
      validUntil: values.validUntil.value || null,
    };
    verify.mutate(body, {
      onSuccess: () =>
        onApproved({
          docType: body.docType,
          certNo: body.certNo ?? undefined,
          supplierName,
          batchNo,
          validUntil: body.validUntil ?? undefined,
        }),
      onError: (error) => {
        if (error instanceof ApiError && error.reason === "DOCUMENT_VERIFIED") setConflictError(true);
        if (error instanceof ApiError && error.errors) {
          setErrors(Object.fromEntries(error.errors.map((e) => [e.field, e.field === "certNo" ? "form.requiredCertNo" : e.field === "validUntil" ? "form.requiredValidUntil" : "form.requiredType"])));
        }
      },
    });
  };

  const missing = Object.keys(errors).length;
  const summary = useMemo(() => {
    if (!values || doc?.extraction?.method !== "LLM") return undefined;
    const ai = KEYS.filter((k) => values[k].source === "ai");
    return { count: ai.length, low: ai.filter((k) => (values[k].confidence ?? 1) < CONFIDENT).length };
  }, [values, doc]);
  const unreadable = doc?.extractionStatus === "UNREADABLE" || doc?.extractionStatus === "FAILED";

  if (document.isError && !doc) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <TopBar title={t("form.title")} backIcon={ChevronLeft} backLabel={t("common.back")} onBack={onBack} border />
        <View style={{ padding: 16 }}>
          <Banner kind="rejected" icon={AlertCircle} title={t("form.loadError")} body={t("errors.network")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t("form.title")} backIcon={ChevronLeft} backLabel={t("common.back")} onBack={onBack} border />
      <ScrollView keyboardShouldPersistTaps="handled">
        <Pages pages={localPages} document={doc} small={missing > 0} />
        {(batchNo || stepLine) && (
          <View style={[styles.belongs, { borderBottomColor: colors.border }]}>
            {batchNo && (
              <T family="mono" weight="semi" size={14}>
                {batchNo}
              </T>
            )}
            {stepLine && <T size={16}>{stepLine}</T>}
          </View>
        )}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 10 }}>
          {timingMs !== undefined && (
            <T family="mono" size={14} tone="muted">
              {t("form.devTiming", { s: (timingMs / 1000).toFixed(1) })}
            </T>
          )}
          {doc && !readingDone(doc) && <Banner kind="submitted" icon={Info} title={t("form.readingNow")} />}
          {unreadable && <Banner kind="rejected" icon={AlertCircle} title={t("form.manualTitle")} body={t("form.manualBody")} />}
          {summary && summary.count > 0 && (
            <View style={[styles.summary, { backgroundColor: colors.status.lowConfidence.muted }]}>
              <Sparkles size={18} color={colors.status.lowConfidence.fg} />
              <T size={15} weight="medium" style={{ color: colors.status.lowConfidence.fg, flex: 1 }}>
                {summary.low > 0 ? t("form.summary", { count: summary.count, low: summary.low }) : t("form.summaryAllGood", { count: summary.count })}
              </T>
            </View>
          )}
          {verify.isError && !(verify.error instanceof ApiError && (verify.error.reason === "DOCUMENT_VERIFIED" || verify.error.errors)) && (
            <Banner
              kind="rejected"
              icon={AlertCircle}
              title={verify.error instanceof ApiError && verify.error.reason === "DOCUMENT_NOT_READ" ? t("form.readingNow") : t("form.saveFailed")}
              meta={verify.error instanceof ApiError ? t("errors.meta", { status: verify.error.status }) : undefined}
            />
          )}
        </View>
        {values && (
          <View style={styles.fields}>
            <FieldBox
              label={t("form.docType")}
              required
              source={values.docType.source}
              value={values.docType.value ? t(`docType.${values.docType.value}`) : ""}
              placeholder={t("form.enter")}
              error={errors.docType ? t(errors.docType) : undefined}
              onPress={canApprove ? () => setTypeSheet(true) : undefined}
            />
            {KEYS.map((key) => {
              const field = values[key];
              const low = field.source === "ai" || field.source === "rule" ? (field.confidence ?? 1) < CONFIDENT : false;
              const isDate = DATE_KEYS.includes(key);
              const required =
                (key === "certNo" || key === "validUntil") && CERTIFICATE_TYPES.includes(values.docType.value as DocType);
              return (
                <FieldBox
                  key={key}
                  label={t(LABEL[key])}
                  required={required}
                  source={field.source}
                  confidence={field.confidence}
                  low={low}
                  mono={key === "certNo"}
                  value={isDate && field.value ? formatDate(field.value) : field.value}
                  placeholder={isDate ? t("form.pickDate") : t("form.enter")}
                  error={errors[key] ? t(errors[key]!) : undefined}
                  date={isDate}
                  onPress={isDate && canApprove ? () => setDateFor(key) : undefined}
                  onChangeText={!isDate && canApprove ? (text) => set(key, text) : undefined}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
      <BottomBar>
        {canApprove ? (
          <>
            {missing > 0 && (
              <T size={15} weight="medium" tone="danger" style={{ textAlign: "center" }}>
                {t("form.missing", { count: missing })}
              </T>
            )}
            <Button
              label={verify.isPending ? t("form.approving") : t("form.approve")}
              variant="brand"
              icon={Check}
              busy={verify.isPending}
              disabled={!values}
              onPress={approve}
            />
          </>
        ) : (
          <>
            <Button label={t("form.locked")} variant="locked" icon={Lock} />
            <T size={15} style={{ textAlign: "center" }}>
              {role === "VIEWER" ? t("form.viewerNote") : t("form.editorNote")}
            </T>
          </>
        )}
      </BottomBar>

      <Sheet visible={typeSheet} onClose={() => setTypeSheet(false)}>
        <T size={18} weight="semi">
          {t("form.docType")}
        </T>
        <View style={styles.types}>
          {ALL_TYPES.map((type) => {
            const on = values?.docType.value === type;
            return (
              <Pressable
                key={type}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  setEdits((e) => ({ ...e, docType: { value: type, source: "user" } }));
                  setTypeSheet(false);
                }}
                style={[styles.type, { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.input }]}
              >
                <T size={16} weight="medium" style={{ color: on ? colors.primaryForeground : colors.foreground }}>
                  {t(`docType.${type}`)}
                </T>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {dateFor && values && (
        <DateSheet
          title={t(LABEL[dateFor])}
          value={values[dateFor].value}
          onClose={() => setDateFor(undefined)}
          onPick={(iso) => {
            set(dateFor, iso);
            setDateFor(undefined);
          }}
        />
      )}

      <Sheet visible={conflict} onClose={onTasks}>
        <View style={[styles.conflictIcon, { backgroundColor: colors.status.submitted.muted }]}>
          <Info size={26} color={colors.status.submitted.fg} />
        </View>
        <T family="serif" size={28}>
          {t("form.conflictTitle")}
        </T>
        <T size={16}>{doc?.verifiedByName ? `${doc.verifiedByName} · ${t("form.conflictBody")}` : t("form.conflictBody")}</T>
        <T size={14} family="mono" tone="muted">
          HTTP 409
        </T>
        <Button label={t("form.backToTasks")} onPress={onTasks} />
      </Sheet>
    </SafeAreaView>
  );
}

/** The pages: the photos just taken (swipe, zoom), or for a document from the list its name and page count. */
function Pages({ pages, document, small }: { pages?: Page[]; document?: DocumentResponse; small: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  if (!pages?.length) {
    if (!document) return null;
    return (
      <View style={[styles.strip, { backgroundColor: colors.muted }]}>
        <View style={styles.paper} />
        <T size={15} style={{ flex: 1 }} numberOfLines={1}>
          {t("form.fileOnly", { name: document.originalName, count: document.pageCount ?? 1 })}
        </T>
      </View>
    );
  }
  if (small) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setZoom(true)} style={[styles.strip, { backgroundColor: colors.muted }]}>
        <Image source={{ uri: pages[0].uri }} style={{ width: 36, height: 48, borderRadius: 4 }} />
        <T size={15} style={{ flex: 1 }}>
          {t("form.pagesHint", { count: pages.length })}
        </T>
        <ZoomModal pages={pages} index={index} visible={zoom} onClose={() => setZoom(false)} />
      </Pressable>
    );
  }
  return (
    <View style={[styles.gallery, { backgroundColor: colors.muted }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {pages.map((p) => (
          <View key={p.uri} style={{ width, height: 212, alignItems: "center", justifyContent: "center" }}>
            <Image source={{ uri: p.uri }} style={{ width: 132, height: 176, borderRadius: 4 }} resizeMode="cover" accessibilityIgnoresInvertColors />
          </View>
        ))}
      </ScrollView>
      <View style={[styles.pageOf, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <T family="mono" weight="medium" size={14}>
          {t("form.pageOf", { n: index + 1, count: pages.length })}
        </T>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("form.zoom")}
        onPress={() => setZoom(true)}
        style={[styles.zoom, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <ZoomIn size={20} color={colors.foreground} />
      </Pressable>
      <ZoomModal pages={pages} index={index} visible={zoom} onClose={() => setZoom(false)} />
    </View>
  );
}

function ZoomModal({ pages, index, visible, onClose }: { pages: Page[]; index: number; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0D11" }}>
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flexGrow: 1 }} centerContent>
          <Image source={{ uri: pages[index]?.uri }} style={{ flex: 1, minHeight: 600 }} resizeMode="contain" />
        </ScrollView>
        <View style={{ padding: 16 }}>
          <Button label={t("common.close")} variant="secondary" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function FieldBox({
  label,
  required = false,
  source,
  confidence,
  low = false,
  mono = false,
  value,
  placeholder,
  error,
  date = false,
  onPress,
  onChangeText,
}: {
  label: string;
  required?: boolean;
  source: Source;
  confidence?: number;
  low?: boolean;
  mono?: boolean;
  value: string;
  placeholder: string;
  error?: string;
  date?: boolean;
  onPress?: () => void;
  onChangeText?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sourceText =
    source === "ai"
      ? confidence !== undefined
        ? t("form.sourceAi", { pct: Math.round(confidence * 100) })
        : t("tasks.aiRead")
      : source === "rule"
        ? t("form.sourceRule")
        : source === "user"
          ? t("form.sourceUser")
          : "";
  const box = [
    styles.box,
    {
      borderColor: error ? colors.destructive : low ? colors.status.lowConfidence.dot : colors.input,
      borderWidth: error || low ? 2 : 1,
      backgroundColor: low ? colors.status.lowConfidence.muted : colors.card,
    },
  ];
  return (
    <View style={{ gap: 7 }}>
      <View style={styles.labelRow}>
        <T size={15} weight="semi">
          {label}
          {required ? <T size={15} style={{ color: colors.destructive }}> *</T> : null}
        </T>
        {sourceText ? (
          <View style={styles.source}>
            {source === "ai" && <Sparkles size={13} color={colors.mutedForeground} />}
            <T size={13} weight="medium" tone="muted">
              {sourceText}
            </T>
          </View>
        ) : null}
      </View>
      {onChangeText ? (
        <TextInput
          accessibilityLabel={label}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          onChangeText={onChangeText}
          autoCapitalize={mono ? "characters" : "sentences"}
          style={[box, { fontSize: 17, color: colors.foreground, fontFamily: mono && value ? fonts.mono : fonts.sans, paddingHorizontal: 14 }]}
        />
      ) : (
        <Pressable
          accessibilityRole={onPress ? "button" : "text"}
          accessibilityLabel={`${label}: ${value || placeholder}`}
          disabled={!onPress}
          onPress={onPress}
          style={[box, styles.pressBox]}
        >
          <T size={17} family={mono && value ? "mono" : "sans"} style={{ flex: 1, color: value ? colors.foreground : colors.mutedForeground }}>
            {value || placeholder}
          </T>
          {date && <Calendar size={20} color={colors.mutedForeground} />}
        </Pressable>
      )}
      {(error || low) && (
        <T size={14} weight="medium" style={{ color: error ? colors.status.rejected.fg : colors.status.lowConfidence.fg }}>
          {error ?? t("form.check")}
        </T>
      )}
    </View>
  );
}

/** Design v0.8 99c: a month with 44 pt days, Monday first, in the language of the texts. */
function DateSheet({ title, value, onClose, onPick }: { title: string; value: string; onClose: () => void; onPick: (iso: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const initial = value ? new Date(`${value}T00:00:00Z`) : new Date();
  const [month, setMonth] = useState(new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)));
  const [picked, setPicked] = useState(value);
  const year = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const lead = (new Date(Date.UTC(year, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  const iso = (d: number) => `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const heads = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale(), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))),
  );
  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.monthHead}>
        <T size={18} weight="semi">
          {title}
        </T>
        <View style={{ flexDirection: "row" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("form.prevMonth")} onPress={() => setMonth(new Date(Date.UTC(year, m - 1, 1)))} style={styles.icon44}>
            <ChevronLeft size={22} color={colors.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t("form.nextMonth")} onPress={() => setMonth(new Date(Date.UTC(year, m + 1, 1)))} style={styles.icon44}>
            <ChevronRight size={22} color={colors.foreground} />
          </Pressable>
        </View>
      </View>
      <T size={16} weight="medium" style={{ marginTop: -10 }}>
        {new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}
      </T>
      <View style={styles.calendar}>
        {heads.map((h) => (
          <View key={h} style={styles.cell}>
            <T size={13} weight="semi" tone="muted">
              {h}
            </T>
          </View>
        ))}
        {cells.map((d, i) => {
          const on = d > 0 && iso(d) === picked;
          return (
            <Pressable
              key={i}
              disabled={d === 0}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={d ? formatDate(iso(d)) : undefined}
              onPress={() => setPicked(iso(d))}
              style={[styles.cell, styles.day, on && { backgroundColor: colors.primary }]}
            >
              {d > 0 && (
                <T size={16} weight={on ? "semi" : "regular"} style={{ color: on ? colors.primaryForeground : colors.foreground }}>
                  {String(d)}
                </T>
              )}
            </Pressable>
          );
        })}
      </View>
      <Button label={picked ? t("form.choose", { date: formatDate(picked) }) : t("form.pickDate")} disabled={!picked} onPress={() => onPick(picked)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  belongs: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 2 },
  summary: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  fields: { gap: 18, padding: 16 },
  labelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  source: { flexDirection: "row", alignItems: "center", gap: 5 },
  box: { minHeight: 52, borderRadius: 10 },
  pressBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, paddingRight: 10, paddingVertical: 12 },
  types: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  type: { height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  strip: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 16 },
  paper: { width: 36, height: 48, borderRadius: 4, backgroundColor: "#E9E4DA" },
  gallery: { height: 212 },
  pageOf: { position: "absolute", left: 12, bottom: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  zoom: { position: "absolute", right: 10, bottom: 10, width: 44, height: 44, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  conflictIcon: { width: 52, height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  monthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon44: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  calendar: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 28, alignItems: "center", justifyContent: "center" },
  day: { height: 44, borderRadius: 999 },
});
