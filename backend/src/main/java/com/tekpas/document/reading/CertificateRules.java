package com.tekpas.document.reading;

import com.tekpas.document.DocType;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * What the reader knows about each document type: the phrases that identify it and the labels its fields are
 * printed under. Labels are matched only at the start of a line and followed by a colon (or alone on their line,
 * with the value on the next one), so a sentence in the body ("... report it as valid until 2099") is never read
 * as a field. Adding a type = one more rule here and one more synthetic document with its golden file.
 */
final class CertificateRules {

    /** The fields a label can name. VALIDITY is a range ("01.04.2026 – 31.03.2027") that fills both dates. */
    enum Key { CERT_NO, HOLDER, ISSUER, VALID_FROM, VALID_UNTIL, VALIDITY }

    /**
     * @param certificate whether the type carries certificate fields (a technical sheet does not)
     */
    record Rule(DocType type, List<Pattern> markers, Map<Key, List<String>> labels, boolean certificate) {
    }

    /** Labels every type shares; English as printed on the certificates, Turkish for local documents. */
    private static final Map<Key, List<String>> COMMON = Map.of(
            Key.CERT_NO, List.of("certificate (?:no\\.?|number)", "cert\\.? no\\.?", "licen[cs]e (?:no\\.?|number)",
                    "registration (?:no\\.?|number)", "sertifika (?:no\\.?|numarası)", "belge no\\.?"),
            Key.HOLDER, List.of("certificate holder", "certified (?:company|organi[sz]ation)", "issued to",
                    "sertifika sahibi"),
            Key.ISSUER, List.of("certification body", "certified by", "issued by", "certifier",
                    "belgelendirme kuruluşu", "veren kuruluş"),
            Key.VALID_FROM, List.of("valid from", "date of issue", "issue date", "geçerlilik başlangıcı",
                    "düzenlenme tarihi"),
            Key.VALID_UNTIL, List.of("valid until", "valid till", "expiry date", "expiration date",
                    "geçerlilik bitişi", "son geçerlilik tarihi"),
            Key.VALIDITY, List.of("period of validity", "validity", "geçerlilik süresi", "geçerlilik"));

    static final List<Rule> RULES = List.of(
            new Rule(DocType.OEKO_TEX, markers("OEKO-TEX", "STANDARD 100"), Map.of(), true),
            new Rule(DocType.GOTS, markers("GLOBAL ORGANIC TEXTILE STANDARD", "\\bGOTS\\b"),
                    Map.of(Key.CERT_NO, List.of("scope certificate (?:no\\.?|number)", "sc number")), true),
            new Rule(DocType.GRS, markers("GLOBAL RECYCLED STANDARD", "\\bGRS\\b"),
                    Map.of(Key.CERT_NO, List.of("scope certificate (?:no\\.?|number)")), true),
            new Rule(DocType.TECH_SHEET, markers("TECHNICAL DATA SHEET", "TEKNİK FÖY", "PRODUCT SPECIFICATION"),
                    Map.of(), false));

    private CertificateRules() {
    }

    /** The type whose phrases appear most often; ties go to the earlier rule. UNKNOWN when none appears. */
    static DocType classify(String text) {
        DocType best = DocType.UNKNOWN;
        int bestScore = 0;
        for (Rule rule : RULES) {
            int score = 0;
            for (Pattern marker : rule.markers()) {
                if (marker.matcher(text).find()) {
                    score++;
                }
            }
            if (score > bestScore) {
                best = rule.type();
                bestScore = score;
            }
        }
        return best;
    }

    static boolean isCertificate(DocType type) {
        return RULES.stream().filter(r -> r.type() == type).findFirst().map(Rule::certificate).orElse(true);
    }

    /** The labels for {@code type}: its own first, then the common ones. */
    static Map<Key, List<String>> labels(DocType type) {
        Map<Key, List<String>> labels = new EnumMap<>(Key.class);
        Map<Key, List<String>> own = RULES.stream().filter(r -> r.type() == type).findFirst().map(Rule::labels)
                .orElse(Map.of());
        for (Key key : Key.values()) {
            List<String> all = new ArrayList<>(own.getOrDefault(key, List.of()));
            all.addAll(COMMON.getOrDefault(key, List.of()));
            labels.put(key, all);
        }
        return labels;
    }

    private static List<Pattern> markers(String... phrases) {
        return java.util.Arrays.stream(phrases)
                .map(p -> Pattern.compile(p, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE)).toList();
    }
}
