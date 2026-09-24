package com.tekpas.common.security;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code CORS_ALLOWED_ORIGINS}, comma separated. */
@ConfigurationProperties("tekpas.cors")
public record CorsProperties(List<String> allowedOrigins) {

    public CorsProperties {
        allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
    }
}
