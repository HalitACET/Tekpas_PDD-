package com.tekpas.document;

import com.tekpas.common.storage.FileStorage;
import com.tekpas.document.FileInspector.InspectedFile;
import com.tekpas.document.FileInspector.Kind;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import javax.imageio.ImageIO;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * The pages a phone photographed, as one PDF document (docs/m8-plan.md §3.1): one certificate is one document and one
 * reading, as on the web. Every page is checked like an uploaded image (magic bytes, pixels from the header before
 * anything is decoded), then decoded and <b>encoded again</b>: nothing of the original file survives but its pixels,
 * so the location and the camera details a phone writes into a photo (EXIF, GPS) never reach the storage. A page
 * whose long edge is over 2000 px is scaled down (the app does it too; this is the guarantee). Each page becomes one
 * A4 page, portrait or landscape as the photo is, the photo fitted in.
 */
@Component
class PhotoPages {

    static final int MAX_PAGES = 10;
    /** Pixels of one photo at most: a 12 MP phone camera fits, a decompression bomb does not reach the decoder. */
    static final long MAX_PIXELS = 25_000_000L;
    static final int MAX_EDGE = 2000;
    static final float QUALITY = 0.8f;

    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final DateTimeFormatter NAME = DateTimeFormatter.ofPattern("yyyyMMdd-HHmm");

    private final Clock clock;

    PhotoPages(Clock clock) {
        this.clock = clock;
    }

    InspectedFile combine(List<MultipartFile> pages) {
        if (pages.isEmpty() || pages.size() > MAX_PAGES) {
            throw UploadRejectedException.pageCount(MAX_PAGES);
        }
        long total = 0;
        for (MultipartFile page : pages) {
            total += page.getSize();
        }
        if (total > FileStorage.MAX_OBJECT_BYTES) {
            throw UploadRejectedException.pagesTooLarge();
        }
        try (PDDocument pdf = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages.size(); i++) {
                addPage(pdf, image(pages.get(i), i));
            }
            pdf.save(out);
            byte[] bytes = out.toByteArray();
            if (bytes.length > FileStorage.MAX_OBJECT_BYTES) {
                throw UploadRejectedException.pagesTooLarge();
            }
            String name = "foto-" + LocalDateTime.ofInstant(clock.instant(), ISTANBUL).format(NAME) + ".pdf";
            return new InspectedFile(bytes, "application/pdf", FileInspector.sha256(bytes), pages.size(), name);
        } catch (IOException e) {
            throw UploadRejectedException.corrupt();
        }
    }

    /** The page's pixels, checked before they are decoded, without alpha and at most 2000 px on the long edge. */
    private static BufferedImage image(MultipartFile page, int index) {
        try {
            byte[] bytes = page.getBytes();
            if (bytes.length == 0) {
                throw UploadRejectedException.empty();
            }
            Kind kind = FileInspector.kindOf(bytes);
            if (kind != Kind.JPEG && kind != Kind.PNG) {
                throw UploadRejectedException.unsupportedType();
            }
            FileInspector.checkedImage(bytes);
            if (pixels(bytes) > MAX_PIXELS) {
                throw UploadRejectedException.tooManyPixels();
            }
            BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(bytes));
            if (decoded == null) {
                throw UploadRejectedException.corrupt();
            }
            return redraw(decoded);
        } catch (UploadRejectedException e) {
            throw e.onPage(index);
        } catch (IOException | RuntimeException e) {
            throw UploadRejectedException.corrupt().onPage(index);
        }
    }

    private static long pixels(byte[] bytes) throws IOException {
        try (var in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw UploadRejectedException.corrupt();
            }
            var reader = readers.next();
            try {
                reader.setInput(in, true, true);
                return (long) reader.getWidth(0) * reader.getHeight(0);
            } finally {
                reader.dispose();
            }
        }
    }

    /** Drawn anew in RGB: no alpha (a JPEG has none), scaled when the long edge is over the limit. */
    static BufferedImage redraw(BufferedImage source) {
        int width = source.getWidth();
        int height = source.getHeight();
        double scale = Math.min(1.0, (double) MAX_EDGE / Math.max(width, height));
        int w = Math.max(1, (int) Math.round(width * scale));
        int h = Math.max(1, (int) Math.round(height * scale));
        BufferedImage target = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = target.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setColor(java.awt.Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.drawImage(source, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return target;
    }

    /** One A4 page with the photo fitted in and centred; JPEG encoded by PDFBox, with no metadata of its own. */
    private static void addPage(PDDocument pdf, BufferedImage image) throws IOException {
        boolean landscape = image.getWidth() > image.getHeight();
        PDRectangle size = landscape ? new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth())
                : PDRectangle.A4;
        PDPage page = new PDPage(size);
        pdf.addPage(page);
        PDImageXObject picture = JPEGFactory.createFromImage(pdf, image, QUALITY);
        float scale = Math.min(size.getWidth() / image.getWidth(), size.getHeight() / image.getHeight());
        float w = image.getWidth() * scale;
        float h = image.getHeight() * scale;
        try (PDPageContentStream content = new PDPageContentStream(pdf, page)) {
            content.drawImage(picture, (size.getWidth() - w) / 2, (size.getHeight() - h) / 2, w, h);
        }
    }
}
