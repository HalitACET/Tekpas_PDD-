package com.tekpas.demo;

import java.util.List;
import java.util.UUID;
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
 * instead of being committed. Products, batches and chains follow in later milestones.
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
        log.info("Demo data ready: {} companies, {} users", COMPANIES.size(), USERS.size());
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
