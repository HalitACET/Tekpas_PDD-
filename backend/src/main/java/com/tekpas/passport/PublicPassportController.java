package com.tekpas.passport;

import com.tekpas.common.web.ClientIp;
import com.tekpas.common.web.RateLimiter;
import com.tekpas.passport.dto.PublicPassportResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The passport page's data, without an account (docs/m6-plan.md §5.1). The web page renders it on the server and caches
 * it until the next publishing or withdrawal, so this is read when the cache is cold or has been refreshed. Own rate
 * limit bucket: per client IP when it is known, one general counter otherwise.
 */
@RestController
@RequestMapping(path = "/api/v1/public/passports", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "public-passports", description = "The published passport of a GS1 Digital Link (no account)")
public class PublicPassportController {

    static final int PER_IP_PER_MINUTE = 120;
    /** All requests together, when the client IP is unknown. */
    static final int GENERAL_PER_MINUTE = 600;

    private final PublicPassportService service;
    private final RateLimiter limiter;
    private final ClientIp clientIp;

    public PublicPassportController(PublicPassportService service, RateLimiter limiter, ClientIp clientIp) {
        this.service = service;
        this.limiter = limiter;
        this.clientIp = clientIp;
    }

    @GetMapping("/01/{gtin}/10/{batch}")
    @Operation(operationId = "getPublicPassport", summary = "The published passport of a code",
            description = "gtin: GTIN-8/12/13/14 (normalized to 14 digits), batch: the AI (10) batch number (upper-cased). "
                    + "Always the newest version; older versions are not public. Never published or unreadable code: "
                    + "404 PASSPORT_NOT_FOUND. Withdrawn: 410 PASSPORT_WITHDRAWN with the date.")
    @ApiResponse(responseCode = "200", description = "The passport")
    @ApiResponse(responseCode = "404", description = "No published passport for this code (PASSPORT_NOT_FOUND)")
    @ApiResponse(responseCode = "410", description = "Withdrawn by the manufacturer (PASSPORT_WITHDRAWN)")
    @ApiResponse(responseCode = "429", description = "Too many requests")
    public ResponseEntity<PublicPassportResponse> getPublicPassport(@PathVariable String gtin,
            @PathVariable String batch, HttpServletRequest http) {
        String ip = clientIp.of(http);
        limiter.hit("passport", ip == null ? "general" : ip, ip == null ? GENERAL_PER_MINUTE : PER_IP_PER_MINUTE,
                Duration.ofMinutes(1));
        PublicPassportResponse body = service.find(gtin, batch);
        // Only a good answer may be cached: a 404 must not outlive the publishing that makes it a 200.
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic()).body(body);
    }
}
