package com.tekpas.passport;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code PUBLIC_BASE_URL} (PLAN K13): the address the QR codes point to, e.g. https://kozapass.vercel.app. No
 * domain yet; changing it later is this one value. {@code REVALIDATE_SECRET}: the secret the web app expects when the
 * backend tells it a passport page is stale; blank (local, tests) means the cache is not refreshed. The same value is
 * set on Render and on Vercel.
 */
@ConfigurationProperties("tekpas.public")
public record PublicProperties(String baseUrl, String revalidateSecret) {

    public PublicProperties {
        if (baseUrl == null || !baseUrl.matches("https?://[^\\s/]+(/.*)?")) {
            throw new IllegalStateException("tekpas.public.base-url (PUBLIC_BASE_URL) must be an http(s) address");
        }
    }

    public boolean canRefreshCache() {
        return revalidateSecret != null && !revalidateSecret.isBlank();
    }

    @Override
    public String toString() {
        return "PublicProperties[baseUrl=" + baseUrl + ", revalidateSecret=***]";
    }
}
