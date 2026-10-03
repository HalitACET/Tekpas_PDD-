package com.tekpas.demo;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demo companies and users with the same UUIDs as {@code src/test/resources/db/seed_demo.sql}. Only in
 * the {@code demo} profile, idempotent, and the password hash is produced here from {@code DEMO_PASSWORD}
 * instead of being committed. Nilufer Giyim gets three products and five DRAFT batches; their GTINs are in the
 * GS1 restricted circulation range (020–029), which is never assigned to a brand, so a demo passport cannot
 * point at a real product. Supply chains follow in M3.
 */
@Component
@Profile("demo")
public class DemoDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    record DemoCompany(UUID id, String name, String type, String city) {
    }

    record DemoUser(UUID id, UUID companyId, String email, String fullName, String role) {
    }

    static final List<DemoCompany> COMPANIES = List.of(
            new DemoCompany(uuid("00000000-0000-0000-0000-000000000001"), "Nilufer Giyim A.S.", "MANUFACTURER", "Bursa"),
            new DemoCompany(uuid("00000000-0000-0000-0000-000000000002"), "Ege Iplik San. Ltd.", "YARN", "Denizli"),
            new DemoCompany(uuid("00000000-0000-0000-0000-000000000003"), "Demirtas Orme Kumas A.S.", "FABRIC", "Bursa"),
            new DemoCompany(uuid("00000000-0000-0000-0000-000000000004"), "Uludag Boya Terbiye", "DYEHOUSE", "Bursa"),
            new DemoCompany(uuid("00000000-0000-0000-0000-000000000005"), "Inegol Fason Dikim", "SEWING", "Bursa"));

    static final List<DemoUser> USERS = List.of(
            new DemoUser(uuid("10000000-0000-0000-0000-000000000001"), uuid("00000000-0000-0000-0000-000000000001"),
                    "admin@nilufergiyim.example", "Demo Yonetici", "OWNER"),
            new DemoUser(uuid("10000000-0000-0000-0000-000000000002"), uuid("00000000-0000-0000-0000-000000000004"),
                    "lab@uludagboya.example", "Boyahane Lab", "SUPPLIER"));

    record DemoProduct(UUID id, String gtin, String sku, String name, String category, String fibers) {
    }

    record DemoBatch(UUID id, UUID productId, String batchNo, String productionOrderNo, int quantity,
            @Nullable LocalDate producedFrom, @Nullable LocalDate producedTo) {
    }

    static final UUID NILUFER = uuid("00000000-0000-0000-0000-000000000001");

    static final List<DemoProduct> PRODUCTS = List.of(
            new DemoProduct(uuid("20000000-0000-0000-0000-000000000001"), "02012345000018", "NG-TS-001-BLU",
                    "Mavi Basic Tişört", "T_SHIRT",
                    "[{\"fiber\":\"COTTON\",\"percent\":95},{\"fiber\":\"ELASTANE\",\"percent\":5}]"),
            new DemoProduct(uuid("20000000-0000-0000-0000-000000000002"), "02012345000025", "NG-PL-002-WHT",
                    "Organik Pamuk Polo", "T_SHIRT", "[{\"fiber\":\"ORGANIC_COTTON\",\"percent\":100}]"),
            new DemoProduct(uuid("20000000-0000-0000-0000-000000000003"), "02012345000032", "NG-SH-003-NAT",
                    "Keten Gömlek", "SHIRT", "[{\"fiber\":\"LINEN\",\"percent\":100}]"));

    static final List<DemoBatch> BATCHES = List.of(
            new DemoBatch(uuid("30000000-0000-0000-0000-000000000001"), PRODUCTS.get(0).id(), "KP-2026-0901-A",
                    "UE-2026-1142", 5000, LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 12)),
            new DemoBatch(uuid("30000000-0000-0000-0000-000000000002"), PRODUCTS.get(0).id(), "KP-2026-0922-A",
                    "UE-2026-1187", 3000, LocalDate.of(2026, 9, 22), null),
            new DemoBatch(uuid("30000000-0000-0000-0000-000000000003"), PRODUCTS.get(1).id(), "KP-2026-0915-A",
                    "UE-2026-1160", 2400, LocalDate.of(2026, 9, 15), LocalDate.of(2026, 9, 26)),
            new DemoBatch(uuid("30000000-0000-0000-0000-000000000004"), PRODUCTS.get(1).id(), "KP-2026-0929-A",
                    "UE-2026-1203", 1800, null, null),
            new DemoBatch(uuid("30000000-0000-0000-0000-000000000005"), PRODUCTS.get(2).id(), "KP-2026-0918-A",
                    "UE-2026-1171", 1200, LocalDate.of(2026, 9, 18), LocalDate.of(2026, 9, 30)));

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final PasswordEncoder passwordEncoder;
    private final DemoProperties properties;

    public DemoDataSeeder(JdbcTemplate jdbc, TransactionTemplate tx, PasswordEncoder passwordEncoder,
            DemoProperties properties) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!properties.hasPassword()) {
            log.warn("DEMO_PASSWORD is not set, skipping demo data");
            return;
        }
        tx.executeWithoutResult(status -> seed());
    }

    private void seed() {
        for (DemoCompany c : COMPANIES) {
            jdbc.update("""
                    INSERT INTO company (id, name, type, city) VALUES (?, ?, ?, ?)
                    ON CONFLICT (id) DO NOTHING
                    """, c.id(), c.name(), c.type(), c.city());
        }
        for (DemoUser u : USERS) {
            seedUser(u);
        }
        for (DemoProduct p : PRODUCTS) {
            // No conflict target: an existing id or a GTIN already taken both leave the row alone.
            jdbc.update("""
                    INSERT INTO product (id, company_id, gtin, sku, name, category, declared_fiber_composition)
                    VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)
                    ON CONFLICT DO NOTHING
                    """, p.id(), NILUFER, p.gtin(), p.sku(), p.name(), p.category(), p.fibers());
        }
        for (DemoBatch b : BATCHES) {
            jdbc.update("""
                    INSERT INTO batch (id, product_id, company_id, batch_no, production_order_no, quantity,
                                       produced_from, produced_to)
                    SELECT ?, ?, ?, ?, ?, ?, ?, ?
                    WHERE EXISTS (SELECT 1 FROM product WHERE id = ? AND company_id = ?)
                    ON CONFLICT DO NOTHING
                    """, b.id(), b.productId(), NILUFER, b.batchNo(), b.productionOrderNo(), b.quantity(),
                    b.producedFrom(), b.producedTo(), b.productId(), NILUFER);
        }
        log.info("Demo data ready: {} companies, {} users, {} products, {} batches", COMPANIES.size(), USERS.size(),
                PRODUCTS.size(), BATCHES.size());
    }

    private void seedUser(DemoUser u) {
        List<String> existing = jdbc.queryForList("SELECT password_hash FROM app_user WHERE id = ?", String.class,
                u.id());
        if (existing.isEmpty()) {
            int inserted = jdbc.update("""
                    INSERT INTO app_user (id, company_id, email, password_hash, full_name, role)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT DO NOTHING
                    """, u.id(), u.companyId(), u.email(), passwordEncoder.encode(properties.password()),
                    u.fullName(), u.role());
            if (inserted == 0) {
                log.warn("Demo user {} not created: the e-mail is taken by another user", u.email());
            }
        } else if (!passwordEncoder.matches(properties.password(), existing.getFirst())) {
            // DEMO_PASSWORD changed since the last start: the new one wins.
            jdbc.update("UPDATE app_user SET password_hash = ? WHERE id = ?",
                    passwordEncoder.encode(properties.password()), u.id());
        }
    }

    private static UUID uuid(String value) {
        return UUID.fromString(value);
    }
}
