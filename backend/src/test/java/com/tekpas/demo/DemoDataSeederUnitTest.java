package com.tekpas.demo;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

class DemoDataSeederUnitTest {

    @Test
    void withoutDemoPasswordNothingIsSeeded() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);

        new DemoDataSeeder(jdbc, tx, encoder, new DemoProperties("  ")).run(null);
        new DemoDataSeeder(jdbc, tx, encoder, new DemoProperties(null)).run(null);

        verifyNoInteractions(jdbc, tx, encoder);
    }
}
