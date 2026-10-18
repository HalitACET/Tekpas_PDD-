package com.tekpas.common.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class StorageConfigTest {

    @Configuration
    @EnableConfigurationProperties(StorageProperties.class)
    @Import(StorageConfig.class)
    static class Config {
    }

    private static final String KEY = "very-secret-service-key";

    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(Config.class);

    @Test
    void withoutAProviderTheApplicationStartsAndStorageAnswersUnavailable() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            FileStorage storage = context.getBean(FileStorage.class);
            assertThat(storage).isInstanceOf(DisabledFileStorage.class);
            assertThatThrownBy(() -> storage.put("docs/c1/d1", new byte[1], "application/pdf"))
                    .isInstanceOf(StorageUnavailableException.class);
            assertThatThrownBy(() -> storage.signedDownloadUrl("docs/c1/d1", Duration.ofSeconds(60), null))
                    .isInstanceOf(StorageUnavailableException.class);
            assertThatThrownBy(() -> storage.delete("docs/c1/d1")).isInstanceOf(StorageUnavailableException.class);
        });
    }

    /** The shipped application.yml: production (no STORAGE_* set yet) must start with storage switched off. */
    @Test
    void productionStartsWithoutStorageAndTheDefaultLocalProfileUsesTheDisk() {
        ApplicationContextRunner shipped = runner.withInitializer(new ConfigDataApplicationContextInitializer());

        shipped.withSystemProperties("spring.profiles.active=prod")
                .run(context -> assertThat(context.getBean(FileStorage.class)).isInstanceOf(DisabledFileStorage.class));
        shipped.run(context -> assertThat(context.getBean(FileStorage.class)).isInstanceOf(LocalFileStorage.class));
    }

    @Test
    void localProviderUsesTheConfiguredDirectory() {
        runner.withPropertyValues("tekpas.storage.provider=local", "tekpas.storage.local-dir=build-test-storage")
                .run(context -> assertThat(context.getBean(FileStorage.class)).isInstanceOf(LocalFileStorage.class));
    }

    @Test
    void supabaseProviderNeedsUrlKeyAndBucket() {
        runner.withPropertyValues("tekpas.storage.provider=supabase").run(context -> assertThat(context.getStartupFailure())
                .rootCause().hasMessageContaining("STORAGE_SUPABASE_URL"));
        runner.withPropertyValues("tekpas.storage.provider=supabase",
                "tekpas.storage.supabase.url=https://abc.supabase.co").run(context ->
                assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("SERVICE_KEY"));
        runner.withPropertyValues("tekpas.storage.provider=supabase",
                "tekpas.storage.supabase.url=https://abc.supabase.co",
                "tekpas.storage.supabase.service-key=" + KEY).run(context ->
                assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("STORAGE_BUCKET"));
    }

    @Test
    void supabaseProviderWithEverythingSetStarts() {
        runner.withPropertyValues("tekpas.storage.provider=supabase",
                "tekpas.storage.supabase.url=https://abc.supabase.co",
                "tekpas.storage.supabase.service-key=" + KEY,
                "tekpas.storage.supabase.bucket=tekpas-docs").run(context ->
                assertThat(context.getBean(FileStorage.class)).isInstanceOf(SupabaseFileStorage.class));
    }

    @Test
    void theServiceKeyOnlyTravelsOverTlsExceptToLoopback() {
        for (String url : new String[] {"http://abc.supabase.co", "ftp://abc.supabase.co", "abc.supabase.co", "https://"}) {
            runner.withPropertyValues("tekpas.storage.provider=supabase", "tekpas.storage.supabase.url=" + url,
                    "tekpas.storage.supabase.service-key=" + KEY, "tekpas.storage.supabase.bucket=tekpas-docs")
                    .run(context -> assertThat(context.getStartupFailure()).as(url).isNotNull());
        }
        runner.withPropertyValues("tekpas.storage.provider=supabase",
                "tekpas.storage.supabase.url=http://localhost:54321",
                "tekpas.storage.supabase.service-key=" + KEY, "tekpas.storage.supabase.bucket=tekpas-docs")
                .run(context -> assertThat(context).hasNotFailed());
    }

    @Test
    void propertiesNeverPrintTheServiceKey() {
        runner.withPropertyValues("tekpas.storage.provider=supabase",
                "tekpas.storage.supabase.url=https://abc.supabase.co",
                "tekpas.storage.supabase.service-key=" + KEY,
                "tekpas.storage.supabase.bucket=tekpas-docs").run(context ->
                assertThat(context.getBean(StorageProperties.class).toString()).doesNotContain(KEY));
    }

    @Test
    void startupFailureMessagesDoNotContainTheKey() {
        runner.withPropertyValues("tekpas.storage.provider=supabase",
                "tekpas.storage.supabase.url=http://abc.supabase.co",
                "tekpas.storage.supabase.service-key=" + KEY,
                "tekpas.storage.supabase.bucket=tekpas-docs").run(context ->
                assertThat(context.getStartupFailure()).rootCause().hasMessageNotContaining(KEY));
    }
}
