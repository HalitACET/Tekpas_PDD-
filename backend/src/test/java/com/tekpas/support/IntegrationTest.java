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
 * Provides {@link TestFixtures}, a {@link MutableClock}, an in-memory {@link FakeFileStorage} and a
 * {@link FakeAiClient} (the LLM gate stays closed unless a test switches it on) and a {@link FakeExpoPushClient}.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, TestClockConfiguration.class, TestStorageConfiguration.class,
        TestAiConfiguration.class, TestPushConfiguration.class, TestFixtures.class})
@ActiveProfiles("test")
public @interface IntegrationTest {
}
