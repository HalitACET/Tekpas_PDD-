package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class FileNamesTest {

    @Test
    void aPlainNameStays() {
        assertThat(FileNames.display("OEKO-TEX_Standard100_2026.pdf", ".pdf")).isEqualTo("OEKO-TEX_Standard100_2026.pdf");
        assertThat(FileNames.display("Sertifika (2).PDF", ".pdf")).isEqualTo("Sertifika (2).PDF");
        assertThat(FileNames.display("foto.jpeg", ".jpg")).isEqualTo("foto.jpeg");
    }

    @Test
    void lettersOfAnyLanguageStay() {
        assertThat(FileNames.display("İplik Belgesi çğıöşü.pdf", ".pdf")).isEqualTo("İplik Belgesi çğıöşü.pdf");
        assertThat(FileNames.display("Zertifikat Größe.pdf", ".pdf")).isEqualTo("Zertifikat Größe.pdf");
    }

    @Test
    void directoriesAreDropped() {
        assertThat(FileNames.display("../../etc/passwd", ".pdf")).isEqualTo("passwd.pdf");
        assertThat(FileNames.display("C:\\Users\\x\\belge.pdf", ".pdf")).isEqualTo("belge.pdf");
        assertThat(FileNames.display("/tmp/a/b.pdf", ".pdf")).isEqualTo("b.pdf");
    }

    @Test
    void markupControlAndDirectionOverrideCharactersAreRemoved() {
        assertThat(FileNames.display("<img src=x onerror=alert(1)>.pdf", ".pdf")).isEqualTo("_img src_x onerror_alert(1)_.pdf");
        // A control character is dropped; a line break reads as a space.
        assertThat(FileNames.display("a\u0000b\nc.pdf", ".pdf")).isEqualTo("ab c.pdf");
        // U+202E would show "fdp.exe" as "exe.pdf" to the reader.
        assertThat(FileNames.display("belge\u202Efdp.exe", ".pdf")).isEqualTo("belgefdp.exe.pdf");
    }

    @Test
    void anEmptyOrDotNameBecomesBelge() {
        assertThat(FileNames.display("", ".pdf")).isEqualTo("belge.pdf");
        assertThat(FileNames.display(null, ".png")).isEqualTo("belge.png");
        assertThat(FileNames.display("...", ".pdf")).isEqualTo("belge.pdf");
        assertThat(FileNames.display("   ", ".pdf")).isEqualTo("belge.pdf");
    }

    @Test
    void theExtensionOfTheDetectedTypeIsAddedWhenMissing() {
        assertThat(FileNames.display("scan", ".jpg")).isEqualTo("scan.jpg");
        assertThat(FileNames.display("scan.pdf", ".png")).isEqualTo("scan.pdf.png");
    }

    @Test
    void aLongNameIsCutBeforeItsExtension() {
        String name = FileNames.display("a".repeat(300) + ".pdf", ".pdf");

        assertThat(name).hasSize(FileNames.MAX_LENGTH).endsWith(".pdf");
    }

    @Test
    void aCombiningSequenceIsNormalised() {
        // "i" + combining dot above, as macOS writes it, becomes the single precomposed letter.
        assertThat(FileNames.display("I\u0307plik.pdf", ".pdf")).isEqualTo("\u0130plik.pdf");
    }
}
