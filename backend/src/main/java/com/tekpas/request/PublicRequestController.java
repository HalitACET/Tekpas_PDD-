package com.tekpas.request;

import com.tekpas.common.web.ClientIp;
import com.tekpas.common.web.RateLimiter;
import com.tekpas.request.dto.PublicRequestView;
import com.tekpas.request.dto.PublicSubmitRequest;
import com.tekpas.request.dto.PublicSubmitResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The supplier's page (design v0.4 39–45) without an account. The token travels in the X-Request-Token header,
 * never in the path or query (K21), so no proxy or access log sees it.
 *
 * Rate limits: per token (openings and submissions) always; per client IP when it is known (ClientIp). Without
 * a client IP all requests share one general counter, and unknown tokens one general counter of their own
 * (a 256-bit token cannot be guessed; the counter only slows a flood down).
 */
@RestController
@RequestMapping(path = "/api/v1/public/request", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "public-requests", description = "The supplier's side of a data request link (no account)")
public class PublicRequestController {

    public static final String TOKEN_HEADER = "X-Request-Token";

    static final int PER_IP_PER_MINUTE = 30;
    static final int INVALID_PER_IP_PER_MINUTE = 10;
    static final int SUBMITS_PER_TOKEN_PER_HOUR = 10;
    static final int OPENS_PER_TOKEN_PER_MINUTE = 60;
    /** All requests together, when the client IP is unknown. */
    static final int GENERAL_PER_MINUTE = 600;
    /** Unknown tokens of all clients together, when the client IP is unknown. */
    static final int GENERAL_INVALID_PER_MINUTE = 100;

    private final PublicRequestService service;
    private final RateLimiter limiter;
    private final ClientIp clientIp;

    public PublicRequestController(PublicRequestService service, RateLimiter limiter, ClientIp clientIp) {
        this.service = service;
        this.limiter = limiter;
        this.clientIp = clientIp;
    }

    @GetMapping
    @Operation(operationId = "openPublicRequest", summary = "What the link holder sees",
            description = "Counts the opening. Unknown token: 404 LINK_INVALID. Expired, revoked or submitted: "
                    + "410 with reason LINK_EXPIRED, LINK_REVOKED or ALREADY_SUBMITTED and the link's context.")
    @ApiResponse(responseCode = "200", description = "The step to fill")
    @ApiResponse(responseCode = "404", description = "Unknown link (LINK_INVALID)")
    @ApiResponse(responseCode = "410", description = "Closed link (LINK_EXPIRED, LINK_REVOKED, ALREADY_SUBMITTED)")
    @ApiResponse(responseCode = "429", description = "Too many requests (Retry-After)")
    public PublicRequestView openPublicRequest(HttpServletRequest http,
            @Parameter(in = ParameterIn.HEADER, name = TOKEN_HEADER, required = true)
            @RequestHeader(name = TOKEN_HEADER, required = false) @Nullable String token) {
        return limited(http, () -> {
            if (token != null && RequestTokens.wellFormed(token)) {
                limiter.hit("open", RequestTokens.hash(token), OPENS_PER_TOKEN_PER_MINUTE, Duration.ofMinutes(1));
            }
            return service.open(token);
        });
    }

    @PostMapping(path = "/submit", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "submitPublicRequest", summary = "Submit the step's data, once",
            description = "Required besides the submitter's name: YARN fiberComposition, originCountry; FABRIC "
                    + "fiberComposition, fabricType; DYEING dyeProcess, chemicalStandards; SEWING originCountry.")
    @ApiResponse(responseCode = "200", description = "Submitted (design v0.4 43)")
    @ApiResponse(responseCode = "400", description = "Validation failed (NotNull, NotApplicable, NoneExclusive, ...)")
    @ApiResponse(responseCode = "404", description = "Unknown link (LINK_INVALID)")
    @ApiResponse(responseCode = "410", description = "Closed link (LINK_EXPIRED, LINK_REVOKED, ALREADY_SUBMITTED)")
    @ApiResponse(responseCode = "429", description = "Too many requests (Retry-After)")
    public PublicSubmitResponse submitPublicRequest(HttpServletRequest http,
            @Parameter(in = ParameterIn.HEADER, name = TOKEN_HEADER, required = true)
            @RequestHeader(name = TOKEN_HEADER, required = false) @Nullable String token,
            @Valid @RequestBody PublicSubmitRequest body) {
        return limited(http, () -> {
            if (token != null && RequestTokens.wellFormed(token)) {
                limiter.hit("submit", RequestTokens.hash(token), SUBMITS_PER_TOKEN_PER_HOUR, Duration.ofHours(1));
            }
            return service.submit(token, body);
        });
    }

    /** The per-IP limits around a call (a lookup of an unknown token also counts against the stricter one). */
    private <T> T limited(HttpServletRequest http, Supplier<T> call) {
        String ip = clientIp.of(http);
        String key = ip == null ? "general" : ip;
        int requests = ip == null ? GENERAL_PER_MINUTE : PER_IP_PER_MINUTE;
        int invalid = ip == null ? GENERAL_INVALID_PER_MINUTE : INVALID_PER_IP_PER_MINUTE;
        limiter.hit("public", key, requests, Duration.ofMinutes(1));
        limiter.check("invalid", key, invalid, Duration.ofMinutes(1));
        try {
            return call.get();
        } catch (LinkClosedException e) {
            if ("LINK_INVALID".equals(e.reason())) {
                limiter.hit("invalid", key, Integer.MAX_VALUE, Duration.ofMinutes(1));
            }
            throw e;
        }
    }
}
