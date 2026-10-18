package com.tekpas.support;

import com.tekpas.TestcontainersConfiguration;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * Full application against Testcontainers Postgres, driven through MockMvc (security filters included).
 * Provides {@link TestFixtures}, a {@link MutableClock} and an in-memory {@link FakeFileStorage}.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, TestClockConfiguration.class, TestStorageConfiguration.class,
        TestFixtures.class})
@ActiveProfiles("test")
public @interface IntegrationTest {
}
