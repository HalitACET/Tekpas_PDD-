package com.tekpas.auth;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** {@code JWT_SECRET}, {@code JWT_ACCESS_TTL}, {@code JWT_REFRESH_TTL}. */
@ConfigurationProperties("tekpas.jwt")
public record JwtProperties(
        String secret,
        @DefaultValue("PT15M") Duration accessTtl,
        @DefaultValue("P30D") Duration refreshTtl) {

    /** HS256 needs a key of at least 256 bits; a shorter secret must stop the application from starting. */
    public static final int MIN_SECRET_BYTES = 32;

    public JwtProperties {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalArgumentException(
                    "tekpas.jwt.secret (JWT_SECRET) must be at least " + MIN_SECRET_BYTES + " bytes");
        }
    }

    public byte[] secretBytes() {
        return secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public String toString() {
        return "JwtProperties[secret=***, accessTtl=" + accessTtl + ", refreshTtl=" + refreshTtl + "]";
    }
}
