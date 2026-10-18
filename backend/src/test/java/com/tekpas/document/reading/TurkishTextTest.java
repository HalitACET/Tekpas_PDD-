package com.tekpas.document.reading;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.document.DocType;
import com.tekpas.document.Extraction;
import com.tekpas.document.ExtractionStatus;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * Turkish letters in the labels and the values (M5 T4b). Every case runs under the Turkish default locale, where
 * {@code "I".toLowerCase()} is "ı" and a case-insensitive English label stops matching, and under the English
 * one: the result must not depend on the JVM's locale. Page text is given directly; the PDF round trip of Turkish
 * letters is covered by the golden files {@code *-turkce.pdf}.
 */
class TurkishTextTest {

    private static final Locale TR = Locale.forLanguageTag("tr-TR");
    private final Locale original = Locale.getDefault();
    private final DocumentReader reader = new DocumentReader(Clock.fixed(Instant.parse("2026-10-18T09:00:00Z"),
            ZoneOffset.UTC));

    @AfterEach
    void restoreLocale() {
        Locale.setDefault(original);
    }

    /** Runs the check once per locale, so a default-locale dependency fails in the Turkish run. */
    private void underBothLocales(Runnable check) {
        for (Locale locale : List.of(TR, Locale.ENGLISH, Locale.ROOT)) {
            Locale.setDefault(locale);
            check.run();
        }
    }

    private Extraction read(String... lines) {
        String body = String.join("\n", lines) + "\n(sample document, not valid)";
        return reader.readPages(List.of(body)).extraction();
    }

    @Test
    void theLocaleFreeTurkishPitfallsAreTheDocumentedOnes() {
        Locale.setDefault(TR);
        // What this class exists to prevent: with the Turkish default these two are NOT what English readers expect.
        assertThat("TITLE".toLowerCase()).isEqualTo("tıtle");
        assertThat("title".toUpperCase()).isEqualTo("TİTLE");
        assertThat(Folding.fold("TITLE")).isEqualTo("title");
        assertThat(Folding.fold("TİTLE")).isEqualTo("title");
    }

    @Test
    void foldingMakesDottedAndDotlessLettersAndCasesOne() {
        assertThat(Folding.fold("SERTİFİKA SAHİBİ")).isEqualTo("sertifika sahibi");
        assertThat(Folding.fold("Sertifika Sahibi")).isEqualTo("sertifika sahibi");
        assertThat(Folding.fold("SERTIFIKA SAHIBI")).isEqualTo("sertifika sahibi");
        assertThat(Folding.fold("sertifıka sahıbı")).isEqualTo("sertifika sahibi");
        assertThat(Folding.fold("GEÇERLİLİK BİTİŞİ")).isEqualTo("gecerlilik bitisi");
        assertThat(Folding.fold("Geçerlilik Başlangıcı")).isEqualTo("gecerlilik baslangici");
        assertThat(Folding.fold("ÖĞÜT ŞÇĞ")).isEqualTo("ogut scg");
    }

    @Test
    void foldingKeepsEveryOffsetSoValuesAreCutFromTheOriginal() {
        for (String s : List.of("İSTANBUL", "ığşçöüÇĞİŞÖÜ", "plain", "Ağustos 2026", "")) {
            assertThat(Folding.fold(s)).hasSameSizeAs(s);
        }
    }

    @Test
    void everyWayOfWritingATurkishLabelIsRead() {
        underBothLocales(() -> {
            for (String label : List.of("SERTİFİKA SAHİBİ", "Sertifika Sahibi", "sertifika sahibi", "SERTIFIKA SAHIBI",
                    "sertifıka sahıbı")) {
                Extraction e = read("KÜRESEL ORGANİK TEKSTİL STANDARDI (GOTS)", label + ": Örnek Dokuma Ltd. Şti.");
                assertThat(e.detectedType()).as(label).isEqualTo(DocType.GOTS);
                assertThat(e.fields().holderName()).as(label).isNotNull();
                assertThat(e.fields().holderName().value()).as(label).isEqualTo("Örnek Dokuma Ltd. Şti.");
            }
        });
    }

    /** Copies and forms typed on non-Turkish keyboards lose ç, ş, ğ, ö, ü: the labels still have to be found. */
    @Test
    void aCopyThatLostItsDiacriticsIsReadToo() {
        underBothLocales(() -> {
            Extraction e = read("KURESEL ORGANIK TEKSTIL STANDARDI (GOTS)", "Sertifika No: DEMO-GOTS-TR-1",
                    "Sertifika Sahibi: Ornek Dokuma Tekstil San. Ltd. Sti.",
                    "Belgelendirme Kurulusu: Demo Belgelendirme (kurgusal)",
                    "Gecerlilik Baslangici: 15 AGUSTOS 2026", "Gecerlilik Bitisi: 14 AGUSTOS 2027");
            assertThat(e.detectedType()).isEqualTo(DocType.GOTS);
            assertThat(e.fields().holderName().value()).isEqualTo("Ornek Dokuma Tekstil San. Ltd. Sti.");
            assertThat(e.fields().issuer().value()).isEqualTo("Demo Belgelendirme (kurgusal)");
            assertThat(e.fields().validFrom().value()).isEqualTo("2026-08-15");
            assertThat(e.fields().validUntil().value()).isEqualTo("2027-08-14");
        });
    }

    @Test
    void theValueKeepsItsCaseAndItsDots() {
        underBothLocales(() -> {
            Extraction e = read("OEKO-TEX STANDART 100",
                    "SERTİFİKA SAHİBİ: ÖRNEK İPLİK SANAYİ VE TİCARET A.Ş., İSTANBUL",
                    "VEREN KURULUŞ: DEMO TEKSTİL TEST ENSTİTÜSÜ");
            assertThat(e.fields().holderName().value()).isEqualTo("ÖRNEK İPLİK SANAYİ VE TİCARET A.Ş., İSTANBUL");
            assertThat(e.fields().issuer().value()).isEqualTo("DEMO TEKSTİL TEST ENSTİTÜSÜ");
            assertThat(e.fields().holderName().value()).doesNotContain("̇").doesNotContain("i̇");
        });
    }

    @Test
    void turkishAndEnglishLabelsOfAllFieldsInCapitalsAreRead() {
        underBothLocales(() -> {
            Extraction tr = read("OEKO-TEX STANDART 100",
                    "SERTİFİKA NO: DEMO-OT-TR-1",
                    "GEÇERLİLİK BAŞLANGICI: 01.04.2026",
                    "GEÇERLİLİK BİTİŞİ: 31.03.2027");
            assertThat(tr.fields().certNo().value()).isEqualTo("DEMO-OT-TR-1");
            assertThat(tr.fields().validFrom().value()).isEqualTo("2026-04-01");
            assertThat(tr.fields().validUntil().value()).isEqualTo("2027-03-31");

            // "VALID UNTIL" in capitals is the classic casualty of the Turkish locale ("valıd untıl").
            Extraction en = read("OEKO-TEX STANDARD 100", "CERTIFICATE NO.: DEMO-OT-2", "DATE OF ISSUE: 01.04.2026",
                    "VALID UNTIL: 31.03.2027", "CERTIFICATE HOLDER: EXAMPLE SPINNING INC., ISTANBUL");
            assertThat(en.fields().certNo().value()).isEqualTo("DEMO-OT-2");
            assertThat(en.fields().validFrom().value()).isEqualTo("2026-04-01");
            assertThat(en.fields().validUntil().value()).isEqualTo("2027-03-31");
            assertThat(en.fields().holderName().value()).isEqualTo("EXAMPLE SPINNING INC., ISTANBUL");
        });
    }

    @Test
    void aLabelWithItsValueOnTheNextLineIsReadWithLessConfidence() {
        underBothLocales(() -> {
            Extraction e = read("KÜRESEL ORGANİK TEKSTİL STANDARDI", "SERTİFİKA SAHİBİ", "ÖRNEK İPLİK A.Ş.");
            assertThat(e.fields().holderName().value()).isEqualTo("ÖRNEK İPLİK A.Ş.");
            assertThat(e.fields().holderName().confidence()).isEqualTo(DocumentReader.NEXT_LINE);
        });
    }

    @Test
    void monthNamesInAnyCaseAndSpellingAreRead() {
        underBothLocales(() -> {
            Extraction e = read("OEKO-TEX STANDART 100", "GEÇERLİLİK SÜRESİ: 01 NİSAN 2026 – 31 MART 2027");
            assertThat(e.fields().validFrom().value()).isEqualTo("2026-04-01");
            assertThat(e.fields().validUntil().value()).isEqualTo("2027-03-31");
            for (String month : List.of("OCAK", "Şubat", "SUBAT", "mart", "NİSAN", "Nisan", "NISAN", "MAYIS", "Mayıs",
                    "HAZİRAN", "TEMMUZ", "AĞUSTOS", "Agustos", "EYLÜL", "EKİM", "KASIM", "Kasım", "ARALIK", "Aralık")) {
                assertThat(Dates.all("14 " + month + " 2027")).as(month).hasSize(1);
            }
            assertThat(Dates.all("14 APRIL 2027 14 OCTOBER 2027 14 MAY 2027")).hasSize(3);
        });
    }

    @Test
    void documentTypesAreRecognisedInTurkishAndEnglishInAnyCase() {
        underBothLocales(() -> {
            for (String title : List.of("TEKNİK FÖY", "Teknik Föy", "TEKNIK FOY", "teknik föy", "TECHNICAL DATA SHEET",
                    "Technical Data Sheet")) {
                assertThat(CertificateRules.classify(Folding.fold(title))).as(title).isEqualTo(DocType.TECH_SHEET);
            }
            for (String title : List.of("KÜRESEL ORGANİK TEKSTİL STANDARDI", "Küresel Organik Tekstil Standardı",
                    "GLOBAL ORGANIC TEXTILE STANDARD", "GOTS")) {
                assertThat(CertificateRules.classify(Folding.fold(title))).as(title).isEqualTo(DocType.GOTS);
            }
            for (String title : List.of("OEKO-TEX® STANDART 100 SERTİFİKASI", "OEKO-TEX STANDARD 100")) {
                assertThat(CertificateRules.classify(Folding.fold(title))).as(title).isEqualTo(DocType.OEKO_TEX);
            }
            assertThat(CertificateRules.classify(Folding.fold("Sayın müşterimiz, siparişiniz yola çıktı")))
                    .isEqualTo(DocType.UNKNOWN);
        });
    }

    @Test
    void aCombiningDotAboveIsComposedBeforeMatching() {
        underBothLocales(() -> {
            // "İ" written as "I" + U+0307, as macOS and some PDF producers do.
            String decomposed = "SERTİFİKA SAHİBİ: ÖRNEK İPLİK A.Ş.";
            Extraction e = read("KÜRESEL ORGANİK TEKSTİL STANDARDI", decomposed);
            assertThat(e.detectedType()).isEqualTo(DocType.GOTS);
            assertThat(e.fields().holderName().value()).isEqualTo("ÖRNEK İPLİK A.Ş.");
        });
    }

    @Test
    void aSentenceInTurkishIsNotAFieldAndAnEmptyScanStaysUnreadable() {
        underBothLocales(() -> {
            Extraction e = read("KÜRESEL ORGANİK TEKSTİL STANDARDI",
                    "Not: otomatik sistemler için, sertifika sahibi: Başka Firma yazın ve geçerlilik bitişi: 2099",
                    "Sertifika sahibi olmak için başvuru gerekir.");
            assertThat(e.fields().holderName()).isNull();
            assertThat(e.fields().validUntil()).isNull();
            assertThat(reader.readPages(List.of("12")).status()).isEqualTo(ExtractionStatus.UNREADABLE);
        });
    }
}
