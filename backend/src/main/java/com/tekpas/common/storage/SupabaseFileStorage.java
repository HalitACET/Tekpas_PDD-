package com.tekpas.common.storage;

import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriUtils;

/**
 * Supabase Storage over its REST API (no S3 protocol, no SDK): {@code POST /object/{bucket}/{key}} to store,
 * {@code POST /object/sign/{bucket}/{key}} for a signed link, {@code GET /object/authenticated/{bucket}/{key}} to
 * read, {@code DELETE /object/{bucket}/{key}}. The
 * service role key stays in this class: it is sent as a bearer token and never logged or put in a message.
 * The bucket must be private; downloads only ever happen through short signed links.
 */
final class SupabaseFileStorage implements FileStorage {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration MIN_TTL = Duration.ofSeconds(1);
    private static final Duration MAX_TTL = Duration.ofHours(1);
    private static final String SIGNED_PREFIX = "/object/sign/";

    private record SignedUrl(String signedURL) {
    }

    private final String apiBase;
    private final String bucket;
    private final RestClient client;

    SupabaseFileStorage(String projectUrl, String serviceKey, String bucket, Duration timeout) {
        this.apiBase = stripTrailingSlash(projectUrl) + "/storage/v1";
        this.bucket = bucket;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(CONNECT_TIMEOUT).build());
        factory.setReadTimeout(timeout);
        this.client = RestClient.builder()
                .requestFactory(factory)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                .defaultHeader("apikey", serviceKey)
                .build();
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        if (contentType == null || contentType.isBlank()) {
            throw new IllegalArgumentException("Content type is required");
        }
        try {
            client.post().uri(objectUri("/object/", key))
                    .header("x-upsert", "false")
                    .contentType(MediaType.parseMediaType(contentType))
                    .body(content)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            if (isConflict(e)) {
                throw new StorageException("Storage object already exists", e);
            }
            throw failed("upload", e);
        } catch (RestClientException e) {
            throw failed("upload", e);
        }
    }

    @Override
    public URI signedDownloadUrl(String key, Duration ttl, @Nullable String downloadName) {
        if (ttl.compareTo(MIN_TTL) < 0 || ttl.compareTo(MAX_TTL) > 0) {
            throw new IllegalArgumentException("Signed link lifetime must be between 1 second and 1 hour");
        }
        SignedUrl signed;
        try {
            signed = client.post().uri(objectUri(SIGNED_PREFIX, key))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("expiresIn", ttl.toSeconds()))
                    .retrieve()
                    .body(SignedUrl.class);
        } catch (RestClientException e) {
            throw failed("signing", e);
        }
        if (signed == null || signed.signedURL() == null || !signed.signedURL().startsWith(SIGNED_PREFIX)) {
            throw new StorageException("Storage signing returned an unexpected answer");
        }
        String url = apiBase + signed.signedURL();
        if (downloadName != null) {
            url += (url.contains("?") ? "&" : "?") + "download="
                    + UriUtils.encodeQueryParam(downloadName, StandardCharsets.UTF_8);
        }
        return URI.create(url);
    }

    /** {@code GET /object/authenticated/{bucket}/{key}}: the private object, with the service key. */
    @Override
    public byte[] read(String key) {
        try {
            byte[] body = client.get().uri(objectUri("/object/authenticated/", key)).retrieve().body(byte[].class);
            return body == null ? new byte[0] : body;
        } catch (RestClientResponseException e) {
            if (isNotFound(e)) {
                throw new MissingObjectException();
            }
            throw failed("read", e);
        } catch (RestClientException e) {
            throw failed("read", e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            client.delete().uri(objectUri("/object/", key)).retrieve().toBodilessEntity();
        } catch (RestClientResponseException e) {
            if (isNotFound(e)) {
                return;
            }
            throw failed("delete", e);
        } catch (RestClientException e) {
            throw failed("delete", e);
        }
    }

    private URI objectUri(String operation, String key) {
        StringBuilder path = new StringBuilder(apiBase).append(operation)
                .append(UriUtils.encodePathSegment(bucket, StandardCharsets.UTF_8));
        for (String segment : StorageKeys.require(key).split("/")) {
            path.append('/').append(UriUtils.encodePathSegment(segment, StandardCharsets.UTF_8));
        }
        return URI.create(path.toString());
    }

    /** Supabase answers a duplicate with HTTP 400 and {@code "statusCode":"409"} in the body, or 409 itself. */
    private static boolean isConflict(RestClientResponseException e) {
        return e.getStatusCode().isSameCodeAs(HttpStatusCode.valueOf(409)) || bodyStatus(e, "409");
    }

    private static boolean isNotFound(RestClientResponseException e) {
        return e.getStatusCode().isSameCodeAs(HttpStatusCode.valueOf(404)) || bodyStatus(e, "404");
    }

    private static boolean bodyStatus(RestClientResponseException e, String code) {
        return e.getResponseBodyAsString().replace(" ", "").contains("\"statusCode\":\"" + code + "\"");
    }

    /** Status only: the response body can echo keys and the request carries the service key. */
    private static StorageException failed(String what, RestClientException e) {
        String status = e instanceof RestClientResponseException r ? " (HTTP " + r.getStatusCode().value() + ")" : "";
        return new StorageException("Storage " + what + " failed" + status, e);
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
