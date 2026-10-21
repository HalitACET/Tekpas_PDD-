package com.tekpas.document;

import com.tekpas.common.storage.FileStorage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * What the server itself finds out about an upload, from its bytes: the type (magic bytes; the extension and
 * the client's Content-Type are ignored), the size, a PDF's pages and encryption, an image's pixels (read from the
 * header only, so a decompression bomb is never decoded). The PDF is parsed for its page tree only; it is not
 * rendered and nothing in it (scripts, embedded files, forms) is run.
 */
@Component
class FileInspector {

    static final int MAX_PDF_PAGES = 20;
    static final long MAX_PIXELS = 40_000_000L;

    /** An accepted file: the bytes, what they are and the facts the row keeps. */
    record InspectedFile(byte[] bytes, String mimeType, String sha256, int pageCount, String displayName) {
    }

    enum Kind {
        PDF("application/pdf", ".pdf"), PNG("image/png", ".png"), JPEG("image/jpeg", ".jpg");

        final String mime;
        final String extension;

        Kind(String mime, String extension) {
            this.mime = mime;
            this.extension = extension;
        }
    }

    InspectedFile inspect(MultipartFile file) {
        if (file.isEmpty()) {
            throw UploadRejectedException.empty();
        }
        if (file.getSize() > FileStorage.MAX_OBJECT_BYTES) {
            throw UploadRejectedException.tooLarge();
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw UploadRejectedException.corrupt();
        }
        if (bytes.length > FileStorage.MAX_OBJECT_BYTES) {
            throw UploadRejectedException.tooLarge();
        }
        Kind kind = kindOf(bytes);
        if (kind == null) {
            throw UploadRejectedException.unsupportedType();
        }
        int pages = kind == Kind.PDF ? pdfPages(bytes) : checkedImage(bytes);
        return new InspectedFile(bytes, kind.mime, sha256(bytes), pages,
                FileNames.display(file.getOriginalFilename(), kind.extension));
    }

    static @Nullable Kind kindOf(byte[] b) {
        if (startsWith(b, '%', 'P', 'D', 'F', '-')) {
            return Kind.PDF;
        }
        if (startsWith(b, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) {
            return Kind.PNG;
        }
        if (startsWith(b, 0xFF, 0xD8, 0xFF)) {
            return Kind.JPEG;
        }
        return null;
    }

    private static boolean startsWith(byte[] bytes, int... prefix) {
        if (bytes.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if ((bytes[i] & 0xFF) != prefix[i]) {
                return false;
            }
        }
        return true;
    }

    private static int pdfPages(byte[] bytes) {
        try (PDDocument pdf = Loader.loadPDF(bytes)) {
            if (pdf.isEncrypted()) {
                throw UploadRejectedException.encrypted();
            }
            int pages = pdf.getNumberOfPages();
            if (pages < 1) {
                throw UploadRejectedException.corrupt();
            }
            if (pages > MAX_PDF_PAGES) {
                throw UploadRejectedException.tooManyPages(MAX_PDF_PAGES);
            }
            return pages;
        } catch (InvalidPasswordException e) {
            throw UploadRejectedException.encrypted();
        } catch (IOException | RuntimeException e) {
            if (e instanceof UploadRejectedException rejected) {
                throw rejected;
            }
            throw UploadRejectedException.corrupt();
        }
    }

    /** Width times height from the image header; the pixels themselves are never decoded. */
    static int checkedImage(byte[] bytes) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw UploadRejectedException.corrupt();
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels <= 0) {
                    throw UploadRejectedException.corrupt();
                }
                if (pixels > MAX_PIXELS) {
                    throw UploadRejectedException.tooManyPixels();
                }
                return 1;
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof UploadRejectedException rejected) {
                throw rejected;
            }
            throw UploadRejectedException.corrupt();
        }
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
