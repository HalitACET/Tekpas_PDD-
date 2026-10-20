package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;

class QrCodesTest {

    static final String URL = "https://kozapass.vercel.app/01/02012345000025/10/KP-2026-0915-A";

    final QrCodes qr = new QrCodes();

    static String decode(BufferedImage image) throws Exception {
        int[] pixels = image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
        return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(
                new RGBLuminanceSource(image.getWidth(), image.getHeight(), pixels)))).getText();
    }

    @Test
    void thePngReadsBackAsTheAddress() throws Exception {
        for (int size : new int[] {512, 1024}) {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(qr.png(URL, size)));

            assertThat(decode(image)).isEqualTo(URL);
            // Whole pixels per module: at most the size asked for and not far below it.
            assertThat(image.getWidth()).isLessThanOrEqualTo(size).isGreaterThan(size - 80).isEqualTo(image.getHeight());
        }
    }

    @Test
    void theQuietZoneIsFourModulesOfWhite() throws Exception {
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(qr.png(URL, 512)));
        // The top-left finder pattern's corner is where the diagonal first turns dark: 4 modules in.
        int corner = 0;
        while ((image.getRGB(corner, corner) & 0xFFFFFF) != 0) {
            corner++;
        }
        int module = corner / 4;

        assertThat(module).isGreaterThanOrEqualTo(1);
        assertThat(corner).isEqualTo(4 * module);
        assertThat(image.getWidth() % module).isZero();
        // Nothing dark in the 4 modules above and to the left of the code, nor in the last 4 modules at the edges.
        for (int i = 0; i < image.getWidth(); i++) {
            for (int d = 0; d < corner; d++) {
                assertThat(image.getRGB(i, d) & 0xFFFFFF).isEqualTo(0xFFFFFF);
                assertThat(image.getRGB(d, i) & 0xFFFFFF).isEqualTo(0xFFFFFF);
                assertThat(image.getRGB(i, image.getHeight() - 1 - d) & 0xFFFFFF).isEqualTo(0xFFFFFF);
                assertThat(image.getRGB(image.getWidth() - 1 - d, i) & 0xFFFFFF).isEqualTo(0xFFFFFF);
            }
        }
    }

    @Test
    void theSvgIsWellFormedAndDrawsTheSameModules() throws Exception {
        String svg = qr.svg(URL);

        Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder()
                .parse(new ByteArrayInputStream(svg.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        assertThat(doc.getDocumentElement().getTagName()).isEqualTo("svg");
        String viewBox = doc.getDocumentElement().getAttribute("viewBox");
        int n = Integer.parseInt(viewBox.split(" ")[2]);
        assertThat(doc.getElementsByTagName("path").item(0).getAttributes().getNamedItem("d").getNodeValue())
                .startsWith("M");

        // Same grid as the PNG at one pixel per module: rasterize the path's runs and read it back.
        BufferedImage grid = new BufferedImage(n * 4, n * 4, BufferedImage.TYPE_BYTE_BINARY);
        for (int y = 0; y < grid.getHeight(); y++) {
            for (int x = 0; x < grid.getWidth(); x++) {
                grid.setRGB(x, y, 0xFFFFFFFF);
            }
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("M(\\d+),(\\d+)h(\\d+)v1h-\\d+z")
                .matcher(doc.getElementsByTagName("path").item(0).getAttributes().getNamedItem("d").getNodeValue());
        while (m.find()) {
            int x = Integer.parseInt(m.group(1));
            int y = Integer.parseInt(m.group(2));
            int w = Integer.parseInt(m.group(3));
            for (int dy = 0; dy < 4; dy++) {
                for (int dx = 0; dx < w * 4; dx++) {
                    grid.setRGB(x * 4 + dx, y * 4 + dy, 0xFF000000);
                }
            }
        }
        assertThat(decode(grid)).isEqualTo(URL);
    }

    @Test
    void aLongerAddressStillFits() throws IOException {
        assertThat(qr.png(URL + "?lang=de", 512)).isNotEmpty();
    }
}
