package com.tekpas.common.storage;

import java.nio.file.Path;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code STORAGE_PROVIDER} ({@code none}, {@code local}, {@code supabase}), {@code STORAGE_LOCAL_DIR},
 * {@code STORAGE_SUPABASE_URL}, {@code STORAGE_SUPABASE_SERVICE_KEY}, {@code STORAGE_BUCKET}.
 */
@ConfigurationProperties("tekpas.storage")
public record StorageProperties(
        @DefaultValue("NONE") Provider provider,
        @DefaultValue(".storage") Path localDir,
        @DefaultValue Supabase supabase) {

    public enum Provider { NONE, LOCAL, SUPABASE }

    /** The project URL ({@code https://<ref>.supabase.co}), the service role key and a private bucket. */
    public record Supabase(String url, String serviceKey, String bucket, @DefaultValue("PT30S") Duration timeout) {

        @Override
        public String toString() {
            return "Supabase[url=" + url + ", serviceKey=***, bucket=" + bucket + ", timeout=" + timeout + "]";
        }
    }
}
