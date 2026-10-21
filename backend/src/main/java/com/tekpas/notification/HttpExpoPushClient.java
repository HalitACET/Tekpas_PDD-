package com.tekpas.notification;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code POST https://exp.host/--/api/v2/push/send} with {@code RestClient} (no SDK). The optional access token goes
 * in the Authorization header only.
 */
class HttpExpoPushClient implements ExpoPushClient {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

    private final URI endpoint;
    private final RestClient client;
    private final ObjectMapper json;

    HttpExpoPushClient(PushProperties properties, ObjectMapper json) {
        this.endpoint = URI.create(properties.url());
        this.json = json;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
        factory.setReadTimeout(properties.timeout());
        RestClient.Builder builder = RestClient.builder().requestFactory(factory);
        if (properties.hasAccessToken()) {
            builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.accessToken());
        }
        this.client = builder.build();
    }

    @Override
    public List<PushTicket> send(List<PushMessage> messages) {
        if (messages.size() > MAX_BATCH) {
            throw new IllegalStateException("At most " + MAX_BATCH + " messages a call");
        }
        String body;
        try {
            body = client.post().uri(endpoint)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(json.writeValueAsString(messages))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            if (status == 429 || status >= 500) {
                throw new PushUnavailableException("Expo push answered " + status);
            }
            throw new IllegalStateException("Expo push refused the request (" + status + ")");
        } catch (RestClientException e) {
            throw new PushUnavailableException("Expo push did not answer");
        }
        return tickets(body, messages.size());
    }

    /** {@code {"data": [{"status": "ok", "id": …} | {"status": "error", "details": {"error": …}}]}} */
    private List<PushTicket> tickets(String body, int expected) {
        JsonNode data;
        try {
            data = json.readTree(body == null ? "{}" : body).path("data");
        } catch (JacksonException e) {
            throw new PushUnavailableException("Expo push answer is not JSON");
        }
        if (!data.isArray() || data.size() != expected) {
            throw new PushUnavailableException("Expo push answer has no ticket per message");
        }
        List<PushTicket> tickets = new ArrayList<>(expected);
        for (JsonNode ticket : data) {
            JsonNode error = ticket.path("details").path("error");
            tickets.add(new PushTicket(ticket.path("status").asString("error"),
                    error.isString() ? error.asString() : null));
        }
        return tickets;
    }
}
