package com.tekpas.common.config;

import java.util.regex.Pattern;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Production must talk to the database over TLS: the JDBC URL has to carry {@code sslmode=require} (or a
 * stricter {@code verify-ca}/{@code verify-full}), otherwise the application does not start.
 */
@Component
@Profile("prod")
public class DatabaseSslGuard implements InitializingBean {

    private static final Pattern SSL_REQUIRED = Pattern.compile("[?&]sslmode=(require|verify-ca|verify-full)(&|$)");

    private final String url;

    public DatabaseSslGuard(@Value("${spring.datasource.url}") String url) {
        this.url = url;
    }

    @Override
    public void afterPropertiesSet() {
        check(url);
    }

    static void check(String jdbcUrl) {
        if (!SSL_REQUIRED.matcher(jdbcUrl).find()) {
            throw new IllegalStateException(
                    "DATABASE_URL must require TLS: add ?sslmode=require (see docs/DEPLOY.md)");
        }
    }
}
