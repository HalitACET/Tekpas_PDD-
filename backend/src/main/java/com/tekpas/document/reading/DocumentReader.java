package com.tekpas.document.reading;

import com.tekpas.document.DocType;
import com.tekpas.document.Extraction;
import com.tekpas.document.Extraction.Evidence;
import com.tekpas.document.Extraction.Field;
import com.tekpas.document.Extraction.FieldSource;
import com.tekpas.document.Extraction.Fields;
import com.tekpas.document.ExtractionMethod;
import com.tekpas.document.ExtractionStatus;
import com.tekpas.document.reading.CertificateRules.Key;
import java.io.IOException;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Reads a document without any outside service (docs/m5-plan.md §3, steps 1–2): the PDF's text layer, the type
 * from its phrases, the fields from the type's labels. An image or a scanned PDF has no text layer and comes back
 * UNREADABLE (NO_TEXT_LAYER); M5 has no OCR, the LLM may try it later (T5), otherwise a person types the values.
 *
 * <p>Confidence: a value on the label's own line that passes its check 0.95; a value on the line below its label
 * 0.8 (the layout leaves room for doubt); a value that fails its check, or dates that contradict each other, 0.6.
 */
@Component
public class DocumentReader {

    static final double SAME_LINE = 0.95;
    static final double NEXT_LINE = 0.8;
    static final double DOUBTFUL = 0.6;
    /** Below this many letters and digits a PDF counts as having no text layer (a scan with a stray page number). */
    static final int MIN_TEXT = 20;
    static final int SNIPPET = 120;

    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final Pattern CERT_NO = Pattern.compile("[A-Za-z0-9][A-Za-z0-9./ -]{2,39}");
    private static final Pattern HAS_DIGIT = Pattern.compile("\\d");
    private static final Pattern HAS_LETTER = Pattern.compile("\\p{L}");

    private final Clock clock;

    public DocumentReader(Clock clock) {
        this.clock = clock;
    }

    /** @throws IOException when the PDF cannot be parsed (the upload already refuses those) */
    public ReadResult read(byte[] bytes, String mimeType) throws IOException {
        if (!"application/pdf".equals(mimeType)) {
            return new ReadResult(ExtractionStatus.UNREADABLE, ExtractionMethod.NONE, ReadResult.NO_TEXT_LAYER, null);
        }
        return readPages(PdfText.pages(bytes));
    }

    /** The reading of the text already taken from the document, page by page. */
    ReadResult readPages(List<String> rawPages) {
        // Composed form first: "I" + combining dot above (how some PDFs and macOS write it) becomes "İ".
        List<String> pages = rawPages.stream().map(p -> Normalizer.normalize(p, Normalizer.Form.NFC)).toList();
        String all = String.join("\n", pages);
        if (all.codePoints().filter(Character::isLetterOrDigit).count() < MIN_TEXT) {
            return new ReadResult(ExtractionStatus.UNREADABLE, ExtractionMethod.NONE, ReadResult.NO_TEXT_LAYER, null);
        }
        DocType type = CertificateRules.classify(Folding.fold(all));
        Map<Key, Field> found = fields(pages, CertificateRules.labels(type));
        List<String> warnings = new ArrayList<>();
        checkDates(found, warnings);
        Fields fields = new Fields(found.get(Key.CERT_NO), found.get(Key.HOLDER), found.get(Key.ISSUER),
                found.get(Key.VALID_FROM), found.get(Key.VALID_UNTIL));
        if (type == DocType.UNKNOWN && !found.isEmpty()) {
            warnings.add("TYPE_NOT_RECOGNISED");
        }
        if (!CertificateRules.isCertificate(type)) {
            return new ReadResult(ExtractionStatus.READ, ExtractionMethod.TEXT_RULES, null,
                    new Extraction(type, ExtractionMethod.TEXT_RULES, fields, warnings));
        }
        if (found.isEmpty()) {
            return new ReadResult(ExtractionStatus.UNREADABLE, ExtractionMethod.NONE, ReadResult.NO_KNOWN_FIELDS,
                    new Extraction(type, ExtractionMethod.NONE, fields, warnings));
        }
        boolean complete = fields.certNo() != null && fields.holderName() != null && fields.validUntil() != null;
        return new ReadResult(complete ? ExtractionStatus.READ : ExtractionStatus.PARTIAL, ExtractionMethod.TEXT_RULES,
                null, new Extraction(type, ExtractionMethod.TEXT_RULES, fields, warnings));
    }

    /** The first match of each field, page by page, line by line. */
    private Map<Key, Field> fields(List<String> pages, Map<Key, List<String>> labels) {
        Map<Key, Pattern> sameLine = new EnumMap<>(Key.class);
        Map<Key, Pattern> ownLine = new EnumMap<>(Key.class);
        labels.forEach((key, list) -> {
            String alternatives = list.stream().map(l -> "(?:" + l + ")").collect(Collectors.joining("|"));
            // Matched against the folded line (see Folding): no flags, no default-locale case rules.
            sameLine.put(key, Pattern.compile("^\\s*(?:" + alternatives + ")\\s*[:：]\\s*(\\S.*)$"));
            ownLine.put(key, Pattern.compile("^\\s*(?:" + alternatives + ")\\s*[:：]?\\s*$"));
        });
        Map<Key, Field> found = new EnumMap<>(Key.class);
        for (int p = 0; p < pages.size(); p++) {
            String[] lines = pages.get(p).split("\\R");
            for (int i = 0; i < lines.length; i++) {
                String folded = Folding.fold(lines[i]);
                for (Key key : Key.values()) {
                    Matcher same = sameLine.get(key).matcher(folded);
                    if (same.matches()) {
                        // Same offsets in the folded and the original line: the value keeps its case and dots.
                        accept(found, key, lines[i].substring(same.start(1)).strip(), SAME_LINE, p + 1, lines[i]);
                    } else if (ownLine.get(key).matcher(folded).matches()) {
                        String next = nextNonEmpty(lines, i);
                        if (next != null) {
                            accept(found, key, next.strip(), NEXT_LINE, p + 1, lines[i].strip() + " / " + next.strip());
                        }
                    }
                }
            }
        }
        return found;
    }

    private void accept(Map<Key, Field> found, Key key, String value, double confidence, int page, String line) {
        Evidence evidence = new Evidence(page, snippet(line));
        switch (key) {
            case CERT_NO -> {
                String number = value.replaceAll("[.,;]+$", "").strip();
                boolean plausible = CERT_NO.matcher(number).matches() && HAS_DIGIT.matcher(number).find();
                put(found, Key.CERT_NO, new Field(number, plausible ? confidence : DOUBTFUL, FieldSource.TEXT_RULES,
                        evidence));
            }
            case HOLDER, ISSUER -> {
                if (HAS_LETTER.matcher(value).find() && value.length() <= 200) {
                    put(found, key, new Field(value, confidence, FieldSource.TEXT_RULES, evidence));
                }
            }
            case VALID_FROM, VALID_UNTIL, VALIDITY -> {
                List<LocalDate> dates = Dates.all(value);
                if (dates.isEmpty()) {
                    return;
                }
                if (key == Key.VALID_FROM) {
                    put(found, Key.VALID_FROM, date(dates.getFirst(), confidence, evidence));
                } else if (key == Key.VALID_UNTIL) {
                    put(found, Key.VALID_UNTIL, date(dates.getLast(), confidence, evidence));
                } else if (dates.size() >= 2) {
                    put(found, Key.VALID_FROM, date(dates.getFirst(), confidence, evidence));
                    put(found, Key.VALID_UNTIL, date(dates.getLast(), confidence, evidence));
                } else {
                    put(found, Key.VALID_UNTIL, date(dates.getFirst(), confidence, evidence));
                }
            }
        }
    }

    /** Validity printed as a range is weaker than its own label: an explicit "Valid until" wins either way. */
    private static void put(Map<Key, Field> found, Key key, Field field) {
        Field existing = found.get(key);
        if (existing == null || existing.confidence() < field.confidence()) {
            found.put(key, field);
        }
    }

    private static Field date(LocalDate date, double confidence, Evidence evidence) {
        return new Field(date.toString(), confidence, FieldSource.TEXT_RULES, evidence);
    }

    /** A start after the end: both are doubtful. An end in the past: the certificate has expired. */
    private void checkDates(Map<Key, Field> found, List<String> warnings) {
        Field from = found.get(Key.VALID_FROM);
        Field until = found.get(Key.VALID_UNTIL);
        if (from != null && until != null && LocalDate.parse(from.value()).isAfter(LocalDate.parse(until.value()))) {
            found.put(Key.VALID_FROM, doubtful(from));
            found.put(Key.VALID_UNTIL, doubtful(until));
            warnings.add("VALIDITY_RANGE_INVALID");
        }
        LocalDate today = LocalDate.ofInstant(clock.instant(), ISTANBUL);
        if (until != null && LocalDate.parse(until.value()).isBefore(today)) {
            warnings.add("EXPIRED");
        }
    }

    private static Field doubtful(Field field) {
        return new Field(field.value(), Math.min(field.confidence(), DOUBTFUL), field.source(), field.evidence());
    }

    private static @Nullable String nextNonEmpty(String[] lines, int index) {
        for (int i = index + 1; i < lines.length; i++) {
            if (!lines[i].isBlank()) {
                return lines[i];
            }
        }
        return null;
    }

    private static String snippet(String line) {
        String s = line.strip().replaceAll("\\s+", " ");
        return s.length() <= SNIPPET ? s : s.substring(0, SNIPPET);
    }
}
