package com.tekpas.importer;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import com.tekpas.support.TestGtins;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.Row;
import org.dhatim.fastexcel.reader.Sheet;
import org.dhatim.fastexcel.reader.SheetVisibility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/** Excel import of products (M11 T5–T6, docs/m11-plan.md §4). */
@IntegrationTest
class ImportApiTest {

    private static final String IMPORTS = "/api/v1/imports";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JobWorker worker;

    @Autowired
    JdbcTemplate jdbc;

    /** A filled template: headers on row 1, a row per array (String or Number cells), the marker sheet unless told. */
    static byte[] xlsx(List<Object[]> rows, boolean marker) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Workbook workbook = new Workbook(out, "test", "1.0");
        Worksheet sheet = workbook.newWorksheet("Ürünler");
        for (ProductColumn column : ProductColumn.values()) {
            sheet.value(0, column.index(), column.key());
        }
        for (int r = 0; r < rows.size(); r++) {
            Object[] cells = rows.get(r);
            for (int c = 0; c < cells.length; c++) {
                if (cells[c] instanceof Number n) {
                    sheet.value(r + 1, c, n);
                } else if (cells[c] != null) {
                    sheet.value(r + 1, c, cells[c].toString());
                }
            }
        }
        if (marker) {
            Worksheet mark = workbook.newWorksheet(ProductTemplate.MARKER_SHEET);
            mark.value(0, 0, ProductTemplate.MARKER);
        }
        workbook.finish();
        return out.toByteArray();
    }

    static Object[] row(Object gtin, String name, String category, Object... fibers) {
        Object[] cells = new Object[ProductColumn.values().length];
        cells[ProductColumn.GTIN.index()] = gtin;
        cells[ProductColumn.SKU.index()] = "SKU-" + name;
        cells[ProductColumn.NAME.index()] = name;
        cells[ProductColumn.CATEGORY.index()] = category;
        for (int i = 0; i < fibers.length; i++) {
            cells[ProductColumn.FIBER_1.index() + i] = fibers[i];
        }
        return cells;
    }

    private MvcTestResult upload(Tenant tenant, byte[] bytes, String name) {
        return fixtures.mvc().post().uri(IMPORTS).multipart()
                .file(new MockMultipartFile("file", name, "application/octet-stream", bytes))
                .header(HttpHeaders.AUTHORIZATION, tenant.bearer()).exchange();
    }

    /** Uploads, runs the queue, returns the finished import. */
    private JsonNode imported(Tenant tenant, byte[] bytes) {
        MvcTestResult started = upload(tenant, bytes, "urunler.xlsx");
        assertThat(started).hasStatus(202);
        assertThat(fixtures.body(started).path("status").asString()).isEqualTo("QUEUED");
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
        return fixtures.body(fixtures.get(tenant, IMPORTS + "/" + fixtures.body(started).path("id").asString()));
    }

    private static List<String> errors(JsonNode imported) {
        return imported.path("errors").valueStream().map(e -> e.path("row").asInt() + ":" + e.path("column").asString()
                + ":" + e.path("code").asString()).toList();
    }

    private long products(Tenant tenant) {
        return jdbc.queryForObject("SELECT count(*) FROM product WHERE company_id = ?", Long.class,
                tenant.company().getId());
    }

    @Test
    void fiftyRowsMakeFortyFiveProductsAndTheFiveBadRowsAreNamedByRowAndColumn() throws IOException {
        Tenant tenant = fixtures.tenant();
        String existing = TestGtins.gtin13();
        assertThat(fixtures.post(tenant, "/api/v1/products", Map.of("gtin", existing, "name", "Var olan", "category",
                "T_SHIRT"))).hasStatus(201);
        List<Object[]> rows = new ArrayList<>();
        List<String> gtins = new ArrayList<>();
        String[] categories = {"Tişört", "T-Shirt", "Hemd", "T_SHIRT", "gömlek"};
        for (int i = 0; i < 45; i++) {
            String gtin = TestGtins.gtin13();
            gtins.add(gtin);
            // A GTIN typed as a number, names in any of the three languages, "5%" as text.
            Object cell = i == 0 ? Long.valueOf(gtin) : gtin;
            rows.add(row(cell, "Ürün " + i, categories[i % categories.length], "Pamuk", 95, "elastane", "5%"));
        }
        String wrongDigit = gtins.get(0).substring(0, 12) + ((gtins.get(0).charAt(12) - '0' + 1) % 10);
        rows.add(row(wrongDigit, "Kontrol hanesi", "Tişört", "Pamuk", 100));
        rows.add(row(TestGtins.gtin13(), "Toplam 99", "Tişört", "Pamuk", 95, "Elastan", 4));
        rows.add(row(TestGtins.gtin13(), null, "Tişört", "Pamuk", 100));
        rows.add(row(gtins.get(1), "Dosyada iki kez", "Tişört", "Pamuk", 100));
        rows.add(row(existing, "Zaten kayıtlı", "Tişört", "Pamuk", 100));
        long before = products(tenant);

        JsonNode result = imported(tenant, xlsx(rows, true));

        assertThat(result.path("status").asString()).isEqualTo("DONE");
        assertThat(result.path("totalRows").asInt()).isEqualTo(50);
        assertThat(result.path("createdRows").asInt()).isEqualTo(45);
        assertThat(result.path("failedRows").asInt()).isEqualTo(5);
        assertThat(errors(result)).containsExactly("47:gtin:GtinCheckDigit", "48:fibers:FiberTotal", "49:name:NotBlank",
                "50:gtin:Duplicate", "51:gtin:Unique");
        assertThat(products(tenant)).isEqualTo(before + 45);
        JsonNode first = fixtures.body(fixtures.get(tenant, "/api/v1/products?q=" + gtins.get(0)));
        assertThat(first.path("content").get(0).path("gtin").asString()).isEqualTo("0" + gtins.get(0));
        assertThat(first.path("content").get(0).path("declaredFiberComposition").valueStream()
                .map(f -> f.path("fiber").asString() + f.path("percent").asInt())).containsExactly("COTTON95", "ELASTANE5");
        assertThat(result.path("errors").get(0).path("value").asString()).isEqualTo(wrongDigit);
    }

    @Test
    void namesNotInTheListsAndBrokenCellsAreRowErrors() throws IOException {
        Tenant tenant = fixtures.tenant();
        List<Object[]> rows = List.of(
                row(TestGtins.gtin13(), "Şapka", "Şapka", "Pamuk", 100),
                row(TestGtins.gtin13(), "Kesirli", "Tişört", "Pamuk", "95,5", "Elastan", "4,5"),
                row(TestGtins.gtin13(), "Lifsiz yüzde", "Tişört", null, 100),
                row(TestGtins.gtin13(), "Bilinmeyen lif", "Tişört", "Kaşmir", 100));

        JsonNode result = imported(tenant, xlsx(rows, true));

        assertThat(errors(result)).containsExactly("2:category:UnknownValue", "3:percent1:Integer",
                "3:percent2:Integer", "4:fiber1:NotNull", "5:fiber1:UnknownValue");
        assertThat(result.path("createdRows").asInt()).isZero();
    }

    @Test
    void theTemplateHasTheHeadersInTheLanguageListsAndTheMarkerAndImportsAsNothing() throws IOException {
        Tenant tenant = fixtures.tenant();

        MvcTestResult de = fixtures.get(tenant, IMPORTS + "/template?kind=products&lang=de");

        assertThat(de).hasStatusOk();
        assertThat(de.getResponse().getContentType()).startsWith(ImportController.XLSX.toString());
        assertThat(de.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION)).contains("attachment");
        byte[] template = de.getResponse().getContentAsByteArray();
        try (ReadableWorkbook workbook = new ReadableWorkbook(new ByteArrayInputStream(template))) {
            List<Sheet> sheets = workbook.getSheets().toList();
            assertThat(sheets).extracting(Sheet::getName).containsExactly("Produkte", "Listen", "kozapass");
            assertThat(sheets.get(2).getVisibility()).isEqualTo(SheetVisibility.VERY_HIDDEN);
            Row header = sheets.get(0).read().getFirst();
            assertThat(header.getCellText(2)).isEqualTo("Produktname");
            assertThat(header.getCellText(5)).isEqualTo("Faser 1");
            assertThat(header.getCellText(10)).isEqualTo("% 3");
            assertThat(sheets.get(1).read().stream().map(r -> r.getCellText(0))).contains("T-Shirt", "Hemd");
        }
        assertThat(new String(template, 0, 2, StandardCharsets.ISO_8859_1)).isEqualTo("PK");
        // The untouched template passes the upload checks and imports nothing.
        JsonNode result = imported(tenant, template);
        assertThat(result.path("status").asString()).isEqualTo("DONE");
        assertThat(result.path("totalRows").asInt()).isZero();
        assertThat(fixtures.get(tenant, IMPORTS + "/template?kind=batches")).hasStatus(400);
    }

    @Test
    void filesThatAreNotTheTemplateAreRefused() throws IOException {
        Tenant tenant = fixtures.tenant();

        assertThat(code(upload(tenant, "%PDF-1.7".getBytes(StandardCharsets.US_ASCII), "a.xlsx"))).isEqualTo("FileType");
        assertThat(code(upload(tenant, new byte[ImportFiles.MAX_BYTES + 1], "big.xlsx"))).isEqualTo("FileSize");
        assertThat(code(upload(tenant, zip(Map.of("[Content_Types].xml", "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
                "xl/vbaProject.bin", "x")), "m.xlsm"))).isEqualTo("FileMacro");
        assertThat(code(upload(tenant, zip(Map.of("[Content_Types].xml", "x", "a.xml", "0".repeat(1024 * 1024 * 41))),
                "bomb.xlsx"))).isEqualTo("FileUnsafe");

        JsonNode noMarker = imported(tenant, xlsx(List.<Object[]>of(row(TestGtins.gtin13(), "X", "Tişört")), false));
        assertThat(noMarker.path("status").asString()).isEqualTo("FAILED");
        assertThat(noMarker.path("failureCode").asString()).isEqualTo("TEMPLATE_UNKNOWN");
        List<Object[]> tooMany = new ArrayList<>();
        for (int i = 0; i < ProductTemplate.MAX_ROWS + 1; i++) {
            tooMany.add(row("1", "x" + i, "Tişört"));
        }
        JsonNode overLimit = imported(tenant, xlsx(tooMany, true));
        assertThat(overLimit.path("failureCode").asString()).isEqualTo("TOO_MANY_ROWS");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM import_job WHERE company_id = ? AND file IS NOT NULL",
                Long.class, tenant.company().getId())).isZero();
    }

    @Test
    void anotherCompanysImportIsNotFoundAndViewersDoNotImport() throws IOException {
        TenantPair tenants = fixtures.twoTenants();
        JsonNode theirs = imported(tenants.b(), xlsx(List.<Object[]>of(row(TestGtins.gtin13(), "B", "Tişört")), true));

        assertThat(fixtures.get(tenants.a(), IMPORTS + "/" + theirs.path("id").asString())).hasStatus(404);
        assertThat(fixtures.body(fixtures.get(tenants.a(), IMPORTS)).valueStream()
                .map(i -> i.path("id").asString())).doesNotContain(theirs.path("id").asString());
        JsonNode mine = fixtures.body(fixtures.get(tenants.b(), IMPORTS));
        assertThat(mine.get(0).path("fileName").asString()).isEqualTo("urunler.xlsx");
        assertThat(mine.get(0).path("errors").isEmpty()).isTrue();
        Tenant viewer = fixtures.member(tenants.b(), UserRole.VIEWER);
        assertThat(upload(viewer, xlsx(List.of(), true), "v.xlsx")).hasStatus(403);
        assertThat(fixtures.get(viewer, IMPORTS + "/template?kind=products")).hasStatus(403);
        assertThat(fixtures.get(viewer, IMPORTS)).hasStatusOk();
        Tenant editor = fixtures.member(tenants.b(), UserRole.EDITOR);
        assertThat(upload(editor, xlsx(List.of(), true), "e.xlsx")).hasStatus(202);
    }

    private String code(MvcTestResult result) {
        assertThat(result).hasStatus(400);
        return fixtures.body(result).path("errors").get(0).path("code").asString();
    }

    private static byte[] zip(Map<String, String> entries) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (Map.Entry<String, String> e : entries.entrySet()) {
                zip.putNextEntry(new ZipEntry(e.getKey()));
                zip.write(e.getValue().getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return Arrays.copyOf(out.toByteArray(), out.size());
    }
}
