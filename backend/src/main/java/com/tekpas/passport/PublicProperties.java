package com.tekpas.passport;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code PUBLIC_BASE_URL} (PLAN K13): the address the QR codes point to, e.g. https://kozapass.vercel.app. No
 * domain yet; changing it later is this one value.
 */
@ConfigurationProperties("tekpas.public")
public record PublicProperties(String baseUrl) {

    public PublicProperties {
        if (baseUrl == null || !baseUrl.matches("https?://[^\\s/]+(/.*)?")) {
            throw new IllegalStateException("tekpas.public.base-url (PUBLIC_BASE_URL) must be an http(s) address");
        }
    }
}
