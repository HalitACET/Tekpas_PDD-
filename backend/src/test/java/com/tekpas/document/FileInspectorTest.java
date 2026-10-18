package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.document.FileInspector.InspectedFile;
import com.tekpas.support.TestFiles;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/** What the server decides from an upload's bytes alone. */
class FileInspectorTest {

    private final FileInspector inspector = new FileInspector();

    private static MockMultipartFile file(String name, String declaredType, byte[] bytes) {
        return new MockMultipartFile("file", name, declaredType, bytes);
    }

    private void assertRejected(MockMultipartFile file, int status, String code) {
        assertThatThrownBy(() -> inspector.inspect(file)).isInstanceOfSatisfying(InvalidFieldsException.class, e -> {
            assertThat(e.status().value()).isEqualTo(status);
            assertThat(e.errors()).extracting(FieldViolation::field, FieldViolation::code)
                    .containsExactly(org.assertj.core.groups.Tuple.tuple("file", code));
        });
    }

    @Test
    void aPdfIsAcceptedWithItsPageCountAndDigest() {
        byte[] bytes = TestFiles.pdf(3);

        InspectedFile inspected = inspector.inspect(file("Sertifika.pdf", "application/pdf", bytes));

        assertThat(inspected.mimeType()).isEqualTo("application/pdf");
        assertThat(inspected.pageCount()).isEqualTo(3);
        assertThat(inspected.sha256()).hasSize(64).matches("[0-9a-f]{64}");
        assertThat(inspected.displayName()).isEqualTo("Sertifika.pdf");
        assertThat(inspected.bytes()).isEqualTo(bytes);
    }

    @Test
    void imagesAreAcceptedAsOnePage() {
        assertThat(inspector.inspect(file("a.png", "image/png", TestFiles.png())).mimeType()).isEqualTo("image/png");
        InspectedFile jpeg = inspector.inspect(file("foto.jpeg", "image/jpeg", TestFiles.jpeg()));
        assertThat(jpeg.mimeType()).isEqualTo("image/jpeg");
        assertThat(jpeg.pageCount()).isEqualTo(1);
    }

    @Test
    void theTypeComesFromTheBytesNotFromTheNameOrTheDeclaredType() {
        InspectedFile png = inspector.inspect(file("sertifika.pdf", "application/pdf", TestFiles.png()));

        assertThat(png.mimeType()).isEqualTo("image/png");
        assertThat(png.displayName()).isEqualTo("sertifika.pdf.png");
    }

    @Test
    void otherTypesAreRefusedWhateverTheyAreCalled() {
        assertRejected(file("a.pdf", "application/pdf", "<html><script>alert(1)</script></html>"
                .getBytes(StandardCharsets.UTF_8)), 415, "FileType");
        assertRejected(file("a.pdf", "application/pdf", new byte[] {'M', 'Z', 1, 2, 3, 4, 5, 6}), 415, "FileType");
        assertRejected(file("a.pdf", "application/pdf", new byte[] {'%', 'P'}), 415, "FileType");
    }

    @Test
    void anEmptyFileIsRefused() {
        assertRejected(file("a.pdf", "application/pdf", new byte[0]), 400, "FileEmpty");
    }

    @Test
    void moreThanTenMegabytesIsRefused() {
        byte[] big = new byte[10 * 1024 * 1024 + 1];
        System.arraycopy(TestFiles.pdf(), 0, big, 0, 8);
        assertRejected(file("big.pdf", "application/pdf", big), 413, "FileTooLarge");
    }

    @Test
    void exactlyTenMegabytesIsStillChecked() {
        byte[] exact = new byte[10 * 1024 * 1024];
        System.arraycopy("%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII), 0, exact, 0, 9);
        // Not a valid PDF, but it is not refused for its size.
        assertRejected(file("exact.pdf", "application/pdf", exact), 400, "FileCorrupt");
    }

    @Test
    void aPdfWithTooManyPagesIsRefused() {
        assertThat(inspector.inspect(file("20.pdf", "application/pdf", TestFiles.pdf(20))).pageCount()).isEqualTo(20);
        assertRejected(file("21.pdf", "application/pdf", TestFiles.pdf(21)), 400, "FilePages");
    }

    @Test
    void anEncryptedOrBrokenPdfIsRefused() {
        assertRejected(file("e.pdf", "application/pdf", TestFiles.encryptedPdf()), 400, "FileEncrypted");
        assertRejected(file("c.pdf", "application/pdf", TestFiles.corruptPdf()), 400, "FileCorrupt");
    }

    @Test
    void aTruncatedImageIsRefused() {
        byte[] png = TestFiles.png();
        assertRejected(file("t.png", "image/png", java.util.Arrays.copyOf(png, 12)), 400, "FileCorrupt");
    }

    @Test
    void anImageOverFortyMegapixelsIsRefusedFromItsHeaderAlone() {
        assertRejected(file("bomb.png", "image/png", TestFiles.pngClaiming(20_000, 20_000)), 400, "FileDimensions");
        assertThat(inspector.inspect(file("ok.png", "image/png", TestFiles.pngClaiming(6_000, 6_000))).pageCount())
                .isEqualTo(1);
    }
}
