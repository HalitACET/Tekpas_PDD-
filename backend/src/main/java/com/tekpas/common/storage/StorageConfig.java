package com.tekpas.common.storage;

import java.net.URI;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Picks the storage by {@code tekpas.storage.provider}. Nothing configured means {@link DisabledFileStorage}
 * (the application still starts); a half-configured Supabase stops the startup instead of failing at the
 * first upload. Messages name the variable, never its value.
 */
@Configuration
public class StorageConfig {

    private static final Pattern BUCKET = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{1,62}");
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "[::1]");

    @Bean
    FileStorage fileStorage(StorageProperties properties) {
        return switch (properties.provider()) {
            case NONE -> new DisabledFileStorage();
            case LOCAL -> new LocalFileStorage(properties.localDir());
            case SUPABASE -> supabase(properties.supabase());
        };
    }

    private static FileStorage supabase(StorageProperties.Supabase config) {
        if (blank(config.url())) {
            throw new IllegalStateException("STORAGE_SUPABASE_URL is required when STORAGE_PROVIDER=supabase");
        }
        if (blank(config.serviceKey())) {
            throw new IllegalStateException(
                    "STORAGE_SUPABASE_SERVICE_KEY is required when STORAGE_PROVIDER=supabase");
        }
        if (blank(config.bucket()) || !BUCKET.matcher(config.bucket()).matches()) {
            throw new IllegalStateException("STORAGE_BUCKET is required (letters, digits, . _ -, 2-63 characters)");
        }
        requireSecureUrl(config.url());
        return new SupabaseFileStorage(config.url(), config.serviceKey(), config.bucket(), config.timeout());
    }

    /** The service key is a bearer token: it only travels over TLS, except to a loopback test server. */
    private static void requireSecureUrl(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("STORAGE_SUPABASE_URL is not a valid URL");
        }
        boolean https = "https".equalsIgnoreCase(uri.getScheme());
        boolean loopback = "http".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                && LOOPBACK.contains(uri.getHost().toLowerCase());
        if (!(https || loopback) || uri.getHost() == null) {
            throw new IllegalStateException("STORAGE_SUPABASE_URL must be an https:// URL");
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
