package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFiles;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The mobile app's two document endpoints (M8 T1–T2, docs/m8-plan.md §3): photographed pages become one PDF without
 * their metadata, and the documents waiting for a person are listed for the Görevlerim screen.
 */
@IntegrationTest
class PhotoDocumentsTest {

    /** What a phone writes into a photo, here as a marker that must never reach the storage. */
    private static final String GPS = "GPS-41.0082N-28.9784E-SECRET";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JobWorker worker;

    DocumentTestSupport t;

    @BeforeEach
    void init() {
        storage.reset();
        t = new DocumentTestSupport(fixtures, storage, json);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
    }

    private void drain() {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
    }

    static byte[] jpeg(int width, int height, Color colour) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(colour);
        g.fillRect(0, 0, width, height);
        g.setColor(Color.BLACK);
        g.drawString("GOTS Scope Certificate", 20, 40);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", out);
        return out.toByteArray();
    }

    /** A JPEG with an APP1 (Exif) segment right after its start, carrying the marker. */
    static byte[] withExif(byte[] jpeg) {
        byte[] payload = ("Exif\0\0" + GPS).getBytes(StandardCharsets.ISO_8859_1);
        int length = payload.length + 2;
        byte[] out = new byte[jpeg.length + 2 + length];
        out[0] = (byte) 0xFF;
        out[1] = (byte) 0xD8;
        out[2] = (byte) 0xFF;
        out[3] = (byte) 0xE1;
        out[4] = (byte) (length >> 8);
        out[5] = (byte) length;
        System.arraycopy(payload, 0, out, 6, payload.length);
        System.arraycopy(jpeg, 2, out, 6 + payload.length, jpeg.length - 2);
        return out;
    }

    private MvcTestResult photos(Tenant who, String stepId, byte[]... pages) {
        var request = fixtures.mvc().post().uri("/api/v1/steps/" + stepId + "/documents/photos").multipart();
        for (int i = 0; i < pages.length; i++) {
            request = request.file(new MockMultipartFile("pages", "IMG_" + i + ".jpg", "image/jpeg", pages[i]));
        }
        return request.header(HttpHeaders.AUTHORIZATION, who.bearer()).exchange();
    }

    private PDDocument stored(JsonNode document) throws IOException {
        String key = jdbc.queryForObject("SELECT file_key FROM document WHERE id = ?::uuid", String.class,
                document.path("id").asString());
        return Loader.loadPDF(storage.read(key));
    }

    private static PDImageXObject imageOf(PDPage page) throws IOException {
        for (COSName name : page.getResources().getXObjectNames()) {
            if (page.getResources().getXObject(name) instanceof PDImageXObject image) {
                return image;
            }
        }
        throw new AssertionError("No image on the page");
    }

    @Test
    void thePagesBecomeOnePdfInTheirOrderAndAreQueuedForReading() throws IOException {
        Setup s = t.setup(fixtures.tenant());

        MvcTestResult result = photos(s.tenant(), s.yarnStep(), jpeg(1200, 1600, Color.WHITE),
                jpeg(1200, 1600, Color.YELLOW), jpeg(1600, 1000, Color.CYAN));

        assertThat(result).hasStatus(202);
        JsonNode body = fixtures.body(result);
        assertThat(body.path("mimeType").asString()).isEqualTo("application/pdf");
        assertThat(body.path("originalName").asString()).matches("foto-\\d{8}-\\d{4}\\.pdf");
        assertThat(body.path("pageCount").asInt()).isEqualTo(3);
        assertThat(body.path("extractionStatus").asString()).isEqualTo("QUEUED");
        try (PDDocument pdf = stored(body)) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(3);
            // Portrait photos on portrait A4, the wide one on landscape A4.
            assertThat(pdf.getPage(0).getMediaBox().getHeight()).isGreaterThan(pdf.getPage(0).getMediaBox().getWidth());
            assertThat(pdf.getPage(2).getMediaBox().getWidth()).isGreaterThan(pdf.getPage(2).getMediaBox().getHeight());
            assertThat(imageOf(pdf.getPage(2)).getWidth()).isEqualTo(1600);
        }
    }

    @Test
    void thePhotosMetadataNeverReachesTheStorageAndLargePhotosAreScaledDown() throws IOException {
        Setup s = t.setup(fixtures.tenant());
        byte[] page = withExif(jpeg(3000, 1500, Color.WHITE));
        assertThat(new String(page, StandardCharsets.ISO_8859_1)).contains(GPS);

        JsonNode body = fixtures.body(photos(s.tenant(), s.yarnStep(), page));

        String key = jdbc.queryForObject("SELECT file_key FROM document WHERE id = ?::uuid", String.class,
                body.path("id").asString());
        byte[] storedBytes = storage.read(key);
        assertThat(new String(storedBytes, StandardCharsets.ISO_8859_1)).doesNotContain(GPS).doesNotContain("Exif");
        try (PDDocument pdf = Loader.loadPDF(storedBytes)) {
            PDImageXObject image = imageOf(pdf.getPage(0));
            assertThat(image.getWidth()).isEqualTo(2000);
            assertThat(image.getHeight()).isEqualTo(1000);
        }
    }

    @Test
    void aPngPageIsAcceptedAndItsTransparencyBecomesWhite() throws IOException {
        Setup s = t.setup(fixtures.tenant());
        BufferedImage image = new BufferedImage(400, 600, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);

        assertThat(photos(s.tenant(), s.yarnStep(), out.toByteArray())).hasStatus(202);
    }

    @Test
    void tooManyPagesAPdfPageOrABrokenPageAreRefusedWithTheirField() throws IOException {
        Setup s = t.setup(fixtures.tenant());
        byte[] ok = jpeg(400, 600, Color.WHITE);

        byte[][] eleven = new byte[11][];
        Arrays.fill(eleven, ok);
        MvcTestResult many = photos(s.tenant(), s.yarnStep(), eleven);
        assertThat(many).hasStatus(400);
        assertThat(fixtures.body(many).path("errors").get(0).path("field").asString()).isEqualTo("pages");
        assertThat(fixtures.body(many).path("errors").get(0).path("code").asString()).isEqualTo("PageCount");

        MvcTestResult pdf = photos(s.tenant(), s.yarnStep(), ok, TestFiles.pdf());
        assertThat(pdf).hasStatus(415);
        assertThat(fixtures.body(pdf).path("errors").get(0).path("field").asString()).isEqualTo("pages[1]");
        assertThat(fixtures.body(pdf).path("errors").get(0).path("code").asString()).isEqualTo("FileType");

        byte[] broken = Arrays.copyOf(ok, 200);
        MvcTestResult corrupt = photos(s.tenant(), s.yarnStep(), broken);
        assertThat(corrupt).hasStatus(400);
        assertThat(fixtures.body(corrupt).path("errors").get(0).path("field").asString()).isEqualTo("pages[0]");

        assertThat(fixtures.mvc().post().uri("/api/v1/steps/" + s.yarnStep() + "/documents/photos").multipart()
                .file(new MockMultipartFile("other", "x.jpg", "image/jpeg", ok))
                .header(HttpHeaders.AUTHORIZATION, s.tenant().bearer()).exchange()).hasStatus(400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM document WHERE step_id = ?::uuid", Long.class, s.yarnStep()))
                .isZero();
    }

    @Test
    void pagesLargerThanADocumentTogetherAreRefused() {
        Setup s = t.setup(fixtures.tenant());
        byte[] big = new byte[5_300_000];
        big[0] = (byte) 0xFF;
        big[1] = (byte) 0xD8;
        big[2] = (byte) 0xFF;

        MvcTestResult result = photos(s.tenant(), s.yarnStep(), big, big);

        assertThat(result.getResponse().getStatus()).isEqualTo(413);
    }

    @Test
    void theRulesOfAnUploadHoldTenantRolesAndPublishedBatches() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        byte[] page = jpeg(400, 600, Color.WHITE);

        assertThat(photos(fixtures.tenant(), s.yarnStep(), page)).hasStatus(404);
        assertThat(photos(fixtures.member(owner, UserRole.VIEWER), s.yarnStep(), page)).hasStatus(403);
        assertThat(photos(fixtures.member(owner, UserRole.SUPPLIER), s.yarnStep(), page)).hasStatus(403);
        assertThat(photos(fixtures.member(owner, UserRole.EDITOR), s.yarnStep(), page)).hasStatus(202);

        jdbc.update("UPDATE batch SET status = 'PUBLISHED' WHERE id = ?::uuid", s.batchId());
        MvcTestResult published = photos(owner, s.yarnStep(), jpeg(400, 600, Color.YELLOW));
        assertThat(published).hasStatus(409);
        assertThat(fixtures.body(published).path("reason").asString()).isEqualTo("BATCH_PUBLISHED");
    }

    @Test
    void theDocumentsWaitingForAPersonAreThoseReadAndNotConfirmed() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String photo = fixtures.body(photos(owner, s.yarnStep(), jpeg(1200, 1600, Color.WHITE))).path("id").asString();

        // Still being read: not yet a task.
        JsonNode before = fixtures.body(fixtures.get(owner, "/api/v1/documents/awaiting-review"));
        assertThat(before.valueStream().map(d -> d.path("id").asString())).doesNotContain(photo);

        drain();
        String pdf = fixtures.body(t.uploadPdf(owner, s.fabricStep())).path("id").asString();
        drain();

        JsonNode list = fixtures.body(fixtures.get(owner, "/api/v1/documents/awaiting-review"));
        assertThat(list.valueStream().map(d -> d.path("id").asString())).containsExactly(pdf, photo);
        JsonNode scan = list.get(1);
        // A photo has no text layer; without the LLM it is left for a person to type.
        assertThat(scan.path("extractionStatus").asString()).isEqualTo("UNREADABLE");
        assertThat(scan.path("proposedFields").asInt()).isZero();
        assertThat(scan.path("stepType").asString()).isEqualTo("YARN");
        assertThat(scan.path("supplierName").asString()).isEqualTo(s.supplierName());
        assertThat(scan.path("batchId").asString()).isEqualTo(s.batchId());
        assertThat(scan.path("batchNo").asString()).isNotBlank();
        assertThat(scan.path("uploadedByName").asString()).isEqualTo("Test User");

        // Confirmed: no longer waiting.
        assertThat(fixtures.post(owner, "/api/v1/documents/" + pdf + "/verify", Map.of("docType", "TECH_SHEET")))
                .hasStatusOk();
        assertThat(fixtures.body(fixtures.get(owner, "/api/v1/documents/awaiting-review")).valueStream()
                .map(d -> d.path("id").asString())).containsExactly(photo);
    }

    @Test
    void theWaitingDocumentsAreTheCompanysOwnAndForStaffOnly() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        photos(owner, s.yarnStep(), jpeg(400, 600, Color.WHITE));
        drain();

        assertThat(fixtures.body(fixtures.get(fixtures.tenant(), "/api/v1/documents/awaiting-review"))).isEmpty();
        assertThat(fixtures.get(fixtures.member(owner, UserRole.VIEWER), "/api/v1/documents/awaiting-review"))
                .hasStatusOk();
        assertThat(fixtures.get(fixtures.member(owner, UserRole.SUPPLIER), "/api/v1/documents/awaiting-review"))
                .hasStatus(403);
        assertThat(fixtures.mvc().get().uri("/api/v1/documents/awaiting-review").exchange()).hasStatus(401);
    }
}
