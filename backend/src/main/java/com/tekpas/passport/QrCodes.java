package com.tekpas.passport;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.EnumMap;
import java.util.Map;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Component;

/**
 * QR codes of the passport address (docs/m6-plan.md §4): error correction M (a worn label still reads), quiet zone of
 * 4 modules as the standard asks. The content is the address only and carries no version, so the same code shows
 * whichever version is current. Only the code itself is drawn, no text: a server image with text would need fonts
 * that the small production image may not have; the human-readable line is shown next to it by the page.
 */
@Component
class QrCodes {

    private static final int QUIET_ZONE_MODULES = 4;

    /** A PNG about {@code size} pixels wide: the modules are drawn at a whole number of pixels each. */
    byte[] png(String text, int size) {
        BitMatrix matrix = encode(text);
        int module = Math.max(1, size / matrix.getWidth());
        int pixels = matrix.getWidth() * module;
        BufferedImage image = new BufferedImage(pixels, pixels, BufferedImage.TYPE_BYTE_BINARY);
        for (int y = 0; y < pixels; y++) {
            for (int x = 0; x < pixels; x++) {
                image.setRGB(x, y, matrix.get(x / module, y / module) ? 0xFF000000 : 0xFFFFFFFF);
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    /** A vector code for print: one path of horizontal runs, scales to any size without blurring. */
    String svg(String text) {
        BitMatrix matrix = encode(text);
        int n = matrix.getWidth();
        StringBuilder path = new StringBuilder();
        for (int y = 0; y < n; y++) {
            int x = 0;
            while (x < n) {
                if (!matrix.get(x, y)) {
                    x++;
                    continue;
                }
                int start = x;
                while (x < n && matrix.get(x, y)) {
                    x++;
                }
                path.append('M').append(start).append(',').append(y).append('h').append(x - start).append("v1h-")
                        .append(x - start).append('z');
            }
        }
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 "
                + n + ' ' + n + "\" width=\"" + n * 8 + "\" height=\"" + n * 8
                + "\" shape-rendering=\"crispEdges\"><rect width=\"" + n + "\" height=\"" + n
                + "\" fill=\"#fff\"/><path d=\"" + path + "\" fill=\"#000\"/></svg>\n";
    }

    private static BitMatrix encode(String text) {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
        hints.put(EncodeHintType.MARGIN, QUIET_ZONE_MODULES);
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
        try {
            // Asking for a 1x1 image returns the smallest one: the modules plus the quiet zone, one pixel each.
            return new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 1, 1, hints);
        } catch (WriterException e) {
            throw new IllegalStateException("The address does not fit a QR code", e);
        }
    }
}
