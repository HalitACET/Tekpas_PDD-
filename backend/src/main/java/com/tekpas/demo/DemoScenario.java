package com.tekpas.demo;

import com.tekpas.batch.BatchProgress;
import com.tekpas.common.storage.FileStorage;
import com.tekpas.passport.PassportService;
import com.tekpas.validation.ValidationService;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The demo's five batches, each showing a moment of the demo (docs/m10-plan.md §3): a published passport, one ready
 * to publish, one with supplier data and a read certificate waiting for a person, one held back by a fibre mismatch
 * (LIF-01) and one still to be set up; one supplier certificate ends within the warning days. Applied once per
 * {@link #VERSION} (V16 {@code demo_scenario}), never to a batch that has a passport (published passports never
 * change, CLAUDE.md rule 6). The documents are synthetic ("ORNEK - GECERSIZ"), already read and, but one, confirmed:
 * nothing goes to the LLM here.
 */
@Component
@Profile("demo")
class DemoScenario {

    private static final Logger log = LoggerFactory.getLogger(DemoScenario.class);

    /** Raise it to apply a changed scenario on the next start (batches with a passport stay as they are). */
    static final int VERSION = 1;
    static final UUID ADMIN = UUID.fromString("10000000-0000-0000-0000-000000000001");
    static final ZoneId ZONE = ZoneId.of("Europe/Istanbul");

    private static final UUID EGE = DemoDataSeeder.SUPPLIERS.get(0).id();
    private static final UUID DEMIRTAS = DemoDataSeeder.SUPPLIERS.get(1).id();
    private static final UUID ULUDAG = DemoDataSeeder.SUPPLIERS.get(2).id();
    private static final UUID INEGOL = DemoDataSeeder.SUPPLIERS.get(3).id();

    static final String COTTON_FIBER = """
            {"fiberType":"COTTON","originCountry":"TR","originRegion":"Harran, Şanlıurfa","harvestYear":2025,\
            "quantityKg":5200}""";
    static final String ORGANIC_FIBER = """
            {"fiberType":"ORGANIC_COTTON","originCountry":"TR","originRegion":"Söke, Aydın","harvestYear":2025,\
            "quantityKg":2600}""";
    static final String COTTON_YARN = """
            {"fiberComposition":[{"fiber":"COTTON","percent":100}],"originCountry":"TR",\
            "energySources":[{"source":"GRID","percent":70},{"source":"SOLAR","percent":30}],\
            "energyKwhPerKg":2.9,"deliveredKg":5100,"yarnCount":"Ne 30/1","yarnProcess":"COMBED"}""";
    static final String ORGANIC_YARN = """
            {"fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":100}],"originCountry":"TR",\
            "energySources":[{"source":"GRID","percent":60},{"source":"SOLAR","percent":40}],\
            "energyKwhPerKg":2.4,"deliveredKg":2450,"yarnCount":"Ne 30/1","yarnProcess":"COMBED"}""";
    static final String COTTON_FABRIC = """
            {"fabricType":"Süprem","gsm":180,"fiberComposition":[{"fiber":"COTTON","percent":95},\
            {"fiber":"ELASTANE","percent":5}],"originCountry":"TR",\
            "energySources":[{"source":"GRID","percent":100}],"energyKwhPerKg":1.8,"deliveredKg":4900}""";
    static final String ORGANIC_FABRIC = """
            {"fabricType":"Pike","gsm":210,"fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":100}],\
            "originCountry":"TR","energySources":[{"source":"GRID","percent":80},{"source":"SOLAR","percent":20}],\
            "energyKwhPerKg":1.6,"deliveredKg":2380}""";
    /** Batch 4: the knitter used elastane; the label says 100 % organic cotton (LIF-01). */
    static final String MISMATCH_FABRIC = """
            {"fabricType":"Pike","gsm":210,"fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":95},\
            {"fiber":"ELASTANE","percent":5}],"originCountry":"TR","energySources":[{"source":"GRID","percent":100}],\
            "energyKwhPerKg":1.7,"deliveredKg":1790}""";
    static final String DYEING = """
            {"dyeProcess":"REACTIVE","chemicalStandards":["ZDHC_MRSL","OEKO_TEX_ECO_PASSPORT"],"waterLPerKg":62,\
            "energySources":[{"source":"NATURAL_GAS","percent":75},{"source":"SOLAR","percent":25}],\
            "energyKwhPerKg":8.1,"shade":"Lacivert"}""";
    static final String SEWING = """
            {"originCountry":"TR","energyKwhPerPiece":0.4,"quantityKg":4800}""";

    /** A step as the scenario wants it; a certificate, when the step holds one. */
    record Step(String type, @Nullable UUID supplier, String status, String data, @Nullable Cert cert,
            @Nullable String submitter) {
    }

    /**
     * A synthetic certificate. {@code confirmed}: a person approved it (the score counts it); otherwise it waits in
     * "Onayınızı bekleyen belgeler" with what the reading proposed.
     */
    record Cert(String docType, String certNo, String holder, String issuer, LocalDate validFrom, LocalDate validUntil,
            boolean confirmed) {
    }

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final FileStorage storage;
    private final BatchProgress progress;
    private final ValidationService validation;
    private final PassportService passports;
    private final Clock clock;

    DemoScenario(JdbcTemplate jdbc, TransactionTemplate tx, FileStorage storage, BatchProgress progress,
            ValidationService validation, PassportService passports, Clock clock) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.storage = storage;
        this.progress = progress;
        this.validation = validation;
        this.passports = passports;
        this.clock = clock;
    }

    /** The five batches in the order of {@link DemoDataSeeder#BATCHES}, built for today's date. */
    List<List<Step>> plan(LocalDate today) {
        LocalDate in20 = today.plusDays(20);
        Cert egeOeko = new Cert("OEKO_TEX", "OT-23-0412 TR", "Ege İplik San. Ltd.", "Demo Testex", LocalDate.of(2026, 1, 15),
                LocalDate.of(2027, 1, 15), true);
        Cert demirtasOeko = new Cert("OEKO_TEX", "OT-23-0877 TR", "Demirtaş Örme Kumaş A.Ş.", "Demo Testex",
                LocalDate.of(2026, 4, 30), LocalDate.of(2027, 4, 30), true);
        // The certificate that ends within the warning days (Görevler, SER-02, the daily scan's notification).
        Cert uludagOeko = new Cert("OEKO_TEX", "OT-22-1190 TR", "Uludağ Boya Terbiye", "Demo Testex",
                in20.minusYears(1), in20, true);
        Cert egeGots = new Cert("GOTS", "CU 1047823", "Ege İplik San. Ltd.", "Demo Control Union",
                LocalDate.of(2026, 3, 13), LocalDate.of(2027, 3, 13), true);
        // Read by the AI, not yet confirmed: two fields under 80 % (design v0.8 92a, v0.9 105a).
        Cert demirtasGots = new Cert("GOTS", "CU 2093311", "Demirtaş Örme Kumaş A.Ş.", "Demo Control Union",
                LocalDate.of(2026, 5, 2), LocalDate.of(2027, 5, 2), false);
        return List.of(
                // 1: published.
                List.of(new Step("FIBER", null, "APPROVED", COTTON_FIBER, null, null),
                        new Step("YARN", EGE, "APPROVED", COTTON_YARN, egeOeko, "Mehmet Kaya"),
                        new Step("FABRIC", DEMIRTAS, "APPROVED", COTTON_FABRIC, demirtasOeko, "Selin Arslan"),
                        new Step("DYEING", ULUDAG, "APPROVED", DYEING, uludagOeko, "Zeynep Arslan"),
                        new Step("SEWING", INEGOL, "APPROVED", SEWING, null, "Hakan Demir")),
                // 2: ready to publish, live in the demo.
                List.of(new Step("FIBER", null, "APPROVED", COTTON_FIBER, null, null),
                        new Step("YARN", EGE, "APPROVED", COTTON_YARN, egeOeko, "Mehmet Kaya"),
                        new Step("FABRIC", DEMIRTAS, "APPROVED", COTTON_FABRIC, demirtasOeko, "Selin Arslan"),
                        new Step("DYEING", ULUDAG, "APPROVED", DYEING, uludagOeko, "Zeynep Arslan"),
                        new Step("SEWING", INEGOL, "APPROVED", SEWING, null, "Hakan Demir")),
                // 3: collecting; the knitter's data and its GOTS certificate wait for a person.
                List.of(new Step("FIBER", null, "APPROVED", ORGANIC_FIBER, null, null),
                        new Step("YARN", EGE, "APPROVED", ORGANIC_YARN, egeGots, "Mehmet Kaya"),
                        new Step("FABRIC", DEMIRTAS, "SUBMITTED", ORGANIC_FABRIC, demirtasGots, "Selin Arslan"),
                        new Step("DYEING", ULUDAG, "PENDING", "{}", null, null),
                        new Step("SEWING", INEGOL, "PENDING", "{}", null, null)),
                // 4: collecting; the fabric does not match the label (LIF-01 blocks publishing).
                List.of(new Step("FIBER", null, "APPROVED", ORGANIC_FIBER, null, null),
                        new Step("YARN", EGE, "APPROVED", ORGANIC_YARN, egeGots, "Mehmet Kaya"),
                        new Step("FABRIC", DEMIRTAS, "APPROVED", MISMATCH_FABRIC, null, "Selin Arslan"),
                        new Step("DYEING", ULUDAG, "PENDING", "{}", null, null),
                        new Step("SEWING", INEGOL, "PENDING", "{}", null, null)),
                // 5: being set up: the dyehouse and the sewing workshop are not assigned yet.
                List.of(new Step("FIBER", null, "PENDING", "{}", null, null),
                        new Step("YARN", EGE, "PENDING", "{}", null, null),
                        new Step("FABRIC", DEMIRTAS, "PENDING", "{}", null, null),
                        new Step("DYEING", null, "PENDING", "{}", null, null),
                        new Step("SEWING", null, "PENDING", "{}", null, null)));
    }

    /** Once per version; a failure is logged and never stops the application. */
    void applyIfNeeded() {
        if (!jdbc.queryForList("SELECT version FROM demo_scenario WHERE version = ?", Integer.class, VERSION).isEmpty()) {
            return;
        }
        try {
            apply();
            jdbc.update("INSERT INTO demo_scenario (version) VALUES (?) ON CONFLICT DO NOTHING", VERSION);
            log.info("Demo scenario {} applied", VERSION);
        } catch (RuntimeException e) {
            log.warn("Demo scenario {} could not be applied: {}", VERSION, e.toString());
        }
    }

    private void apply() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZONE);
        List<List<Step>> plan = plan(today);
        List<UUID> changed = new ArrayList<>();
        for (int b = 0; b < DemoDataSeeder.BATCHES.size(); b++) {
            UUID batchId = DemoDataSeeder.BATCHES.get(b).id();
            int index = b;
            Boolean done = tx.execute(status -> applyBatch(batchId, index + 1, plan.get(index), today));
            if (Boolean.TRUE.equals(done)) {
                changed.add(batchId);
            }
        }
        for (UUID batchId : changed) {
            tx.executeWithoutResult(status -> progress.refresh(batchId));
            validation.validate(DemoDataSeeder.NILUFER, batchId);
        }
        UUID first = DemoDataSeeder.BATCHES.getFirst().id();
        if (changed.contains(first)) {
            passports.publish(DemoDataSeeder.NILUFER, ADMIN, first);
        }
    }

    /** False when the batch is missing or has a passport: it is left as it is. */
    private boolean applyBatch(UUID batchId, int batchNumber, List<Step> steps, LocalDate today) {
        boolean exists = !jdbc.queryForList("SELECT id FROM batch WHERE id = ? AND company_id = ?", UUID.class, batchId,
                DemoDataSeeder.NILUFER).isEmpty();
        boolean hasPassport = !jdbc.queryForList("SELECT id FROM passport WHERE batch_id = ?", UUID.class, batchId).isEmpty();
        if (!exists || hasPassport) {
            return false;
        }
        // What earlier tries left on the batch goes: the scenario is the whole story of its steps.
        List<String> keys = jdbc.queryForList("""
                SELECT d.file_key FROM document d JOIN supply_step s ON s.id = d.step_id WHERE s.batch_id = ?""",
                String.class, batchId);
        jdbc.update("DELETE FROM validation_issue WHERE batch_id = ?", batchId);
        jdbc.update("DELETE FROM document WHERE step_id IN (SELECT id FROM supply_step WHERE batch_id = ?)", batchId);
        jdbc.update("DELETE FROM step_event WHERE step_id IN (SELECT id FROM supply_step WHERE batch_id = ?)", batchId);
        jdbc.update("DELETE FROM data_request WHERE step_id IN (SELECT id FROM supply_step WHERE batch_id = ?)", batchId);
        for (String key : keys) {
            try {
                storage.delete(key);
            } catch (RuntimeException e) {
                log.debug("Demo document object not removed: {}", e.toString());
            }
        }
        // The production dates count for the score (both are needed to publish).
        jdbc.update("""
                UPDATE batch SET produced_from = COALESCE(produced_from, ?), produced_to = COALESCE(produced_to, ?)
                WHERE id = ? AND ? <= 2""", today.minusDays(40), today.minusDays(25), batchId, batchNumber);
        for (int i = 0; i < steps.size(); i++) {
            Step step = steps.get(i);
            UUID stepId = UUID.fromString(String.format("40000000-0000-0000-0000-0000000000%d%d", batchNumber, i + 1));
            int daysAgo = 30 - i * 4;
            jdbc.update("""
                    UPDATE supply_step SET supplier_company_id = ?, status = ?, data = ?::jsonb,
                        submitted_at = CASE WHEN ? <> 'PENDING' THEN now() - make_interval(days => ?) END,
                        approved_at = CASE WHEN ? = 'APPROVED' THEN now() - make_interval(days => ?) END,
                        approved_by = CASE WHEN ? = 'APPROVED' THEN ?::uuid END,
                        rejection_reason = NULL, rejection_fields = NULL, rejected_at = NULL, rejected_by = NULL,
                        updated_at = now()
                    WHERE id = ? AND batch_id = ?""",
                    step.supplier(), step.status(), step.data(), step.status(), daysAgo, step.status(),
                    Math.max(daysAgo - 1, 0), step.status(), ADMIN, stepId, batchId);
            UUID requestId = step.submitter() == null ? null : request(stepId, step.submitter(), daysAgo);
            if (step.cert() != null) {
                certificate(stepId, requestId, step.supplier(), step.cert(), batchNumber, i + 1, daysAgo);
            }
        }
        return true;
    }

    /** The link the supplier filled in, completed: the review shows who sent the data and when. */
    private UUID request(UUID stepId, String submitter, int daysAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO data_request (id, step_id, token_hash, status, expires_at, completed_at, created_by,
                    created_at, open_count, submitter_name, submitter_role)
                VALUES (?, ?, ?, 'COMPLETED', now() - make_interval(days => ?), now() - make_interval(days => ?), ?,
                    now() - make_interval(days => ?), 2, ?, ?)""",
                id, stepId, sha256((id + stepId.toString()).getBytes(StandardCharsets.UTF_8)), Math.max(daysAgo - 7, 0),
                daysAgo, ADMIN, daysAgo + 2, submitter, "Kalite sorumlusu");
        return id;
    }

    private void certificate(UUID stepId, @Nullable UUID requestId, @Nullable UUID supplier, Cert cert, int batchNumber,
            int stepNumber, int daysAgo) {
        UUID id = UUID.fromString(String.format("50000000-0000-0000-0000-0000000000%d%d", batchNumber, stepNumber));
        byte[] pdf = pdf(cert);
        String key = "docs/" + DemoDataSeeder.NILUFER + "/" + id;
        storage.put(key, pdf, "application/pdf");
        String name = cert.docType().toLowerCase().replace('_', '-') + "-" + cert.certNo().replace(' ', '-') + ".pdf";
        if (cert.confirmed()) {
            jdbc.update("""
                    INSERT INTO document (id, company_id, step_id, request_id, doc_type, file_key, original_name,
                        mime_type, size_bytes, sha256, page_count, extraction_status, review_status, extraction_method,
                        extracted_at, cert_no, holder_name, issuer, valid_from, valid_until, verified_by, verified_at,
                        uploaded_by_name, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, 1, 'READ', 'VERIFIED', 'TEXT_RULES',
                        now() - make_interval(days => ?), ?, ?, ?, ?, ?, ?, now() - make_interval(days => ?), ?,
                        now() - make_interval(days => ?))""",
                    id, DemoDataSeeder.NILUFER, stepId, requestId, cert.docType(), key, name, pdf.length, sha256(pdf),
                    daysAgo, cert.certNo(), cert.holder(), cert.issuer(), cert.validFrom(), cert.validUntil(), ADMIN,
                    Math.max(daysAgo - 1, 0), cert.holder(), daysAgo);
        } else {
            jdbc.update("""
                    INSERT INTO document (id, company_id, step_id, request_id, doc_type, file_key, original_name,
                        mime_type, size_bytes, sha256, page_count, extraction_status, review_status, extraction,
                        extraction_method, extraction_model, extracted_at, uploaded_by_name, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, 1, 'READ', 'UNREVIEWED', ?::jsonb, 'LLM', 'demo',
                        now() - interval '2 hours', ?, now() - interval '2 hours')""",
                    id, DemoDataSeeder.NILUFER, stepId, requestId, cert.docType(), key, name, pdf.length, sha256(pdf),
                    extraction(cert), cert.holder());
        }
    }

    /** What an LLM reading of a scan proposes: two values it found in the text, three it is less sure of. */
    static String extraction(Cert cert) {
        return """
                {"detectedType":"%s","method":"LLM","warnings":[],"fields":{\
                "certNo":{"value":"%s","confidence":0.75,"source":"LLM","evidence":null},\
                "holderName":{"value":"%s","confidence":0.6,"source":"LLM","evidence":null},\
                "issuer":{"value":"%s","confidence":0.75,"source":"LLM","evidence":null},\
                "validFrom":{"value":"%s","confidence":0.6,"source":"LLM","evidence":null},\
                "validUntil":{"value":"%s","confidence":0.75,"source":"LLM","evidence":null}}}"""
                .formatted(cert.docType(), cert.certNo(), cert.holder(), cert.issuer(), cert.validFrom(),
                        cert.validUntil());
    }

    /** A one-page certificate that says on its face that it is not valid. PDF's base fonts have no Turkish letters. */
    static byte[] pdf(Cert cert) {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDType1Font bold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
            PDType1Font regular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            try (PDPageContentStream text = new PDPageContentStream(doc, page)) {
                float y = 760;
                for (String[] line : new String[][] {
                        {"B", "ORNEK - GECERSIZ / SAMPLE - NOT VALID"},
                        {"B", cert.docType().equals("GOTS") ? "GLOBAL ORGANIC TEXTILE STANDARD" : "OEKO-TEX STANDARD 100"},
                        {"R", "Scope Certificate"},
                        {"R", "Certificate No: " + cert.certNo()},
                        {"R", "Certified Organisation: " + ascii(cert.holder())},
                        {"R", "Certification Body: " + ascii(cert.issuer())},
                        {"R", "Valid from: " + cert.validFrom()},
                        {"R", "Valid until: " + cert.validUntil()},
                        {"R", "KozaPass demo document - generated, not issued by any body"}}) {
                    text.beginText();
                    text.setFont(line[0].equals("B") ? bold : regular, line[0].equals("B") ? 16 : 12);
                    text.newLineAtOffset(60, y);
                    text.showText(line[1]);
                    text.endText();
                    y -= 32;
                }
            }
            doc.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Demo certificate could not be written", e);
        }
    }

    private static String ascii(String text) {
        return text.replace('ı', 'i').replace('İ', 'I').replace('ş', 's').replace('Ş', 'S').replace('ğ', 'g')
                .replace('Ğ', 'G').replace('ü', 'u').replace('Ü', 'U').replace('ö', 'o').replace('Ö', 'O')
                .replace('ç', 'c').replace('Ç', 'C');
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
