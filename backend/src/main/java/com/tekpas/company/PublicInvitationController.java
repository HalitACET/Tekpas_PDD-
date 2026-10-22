package com.tekpas.company;

import com.tekpas.common.web.ClientIp;
import com.tekpas.common.web.RateLimiter;
import com.tekpas.company.dto.AcceptInvitationRequest;
import com.tekpas.company.dto.PublicInvitationView;
import com.tekpas.request.RequestTokens;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The invited person's side (design brief v1.2 161), without an account. As the supplier's link (K21), the token
 * travels in a header, never in the path or query. Rate limits: per token always, per client IP when it is known,
 * and one general counter.
 */
@RestController
@RequestMapping(path = "/api/v1/public/invitation", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "public-invitations", description = "Joining a company with an invitation link (no account yet)")
public class PublicInvitationController {

    public static final String TOKEN_HEADER = "X-Invitation-Token";

    static final int PER_TOKEN_PER_MINUTE = 30;
    static final int PER_IP_PER_MINUTE = 30;
    static final int GENERAL_PER_MINUTE = 300;

    private final UserService service;
    private final RateLimiter limiter;
    private final ClientIp clientIp;

    public PublicInvitationController(UserService service, RateLimiter limiter, ClientIp clientIp) {
        this.service = service;
        this.limiter = limiter;
        this.clientIp = clientIp;
    }

    @GetMapping
    @Operation(operationId = "openInvitation", summary = "Who invites whom, before choosing a password")
    @ApiResponse(responseCode = "200", description = "The invitation")
    @ApiResponse(responseCode = "404", description = "Unknown link (INVITATION_INVALID)")
    @ApiResponse(responseCode = "410", description = "INVITATION_EXPIRED or INVITATION_USED")
    @ApiResponse(responseCode = "429", description = "Too many requests (Retry-After)")
    public PublicInvitationView openInvitation(HttpServletRequest http,
            @Parameter(in = ParameterIn.HEADER, name = TOKEN_HEADER, required = true)
            @RequestHeader(name = TOKEN_HEADER, required = false) @Nullable String token) {
        limit(http, token);
        return service.open(token);
    }

    @PostMapping(path = "/accept", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "acceptInvitation", summary = "Choose a password; the account opens",
            description = "The link is used up. Then the person logs in with the e-mail and this password.")
    @ApiResponse(responseCode = "204", description = "Joined")
    @ApiResponse(responseCode = "400", description = "Validation failed (password: 10 to 72 characters)")
    @ApiResponse(responseCode = "404", description = "Unknown link (INVITATION_INVALID)")
    @ApiResponse(responseCode = "410", description = "INVITATION_EXPIRED or INVITATION_USED")
    @ApiResponse(responseCode = "429", description = "Too many requests (Retry-After)")
    public void acceptInvitation(HttpServletRequest http,
            @Parameter(in = ParameterIn.HEADER, name = TOKEN_HEADER, required = true)
            @RequestHeader(name = TOKEN_HEADER, required = false) @Nullable String token,
            @Valid @RequestBody AcceptInvitationRequest request) {
        limit(http, token);
        service.accept(token, request.password());
    }

    private void limit(HttpServletRequest http, @Nullable String token) {
        String ip = clientIp.of(http);
        if (ip != null) {
            limiter.hit("invitation-ip", ip, PER_IP_PER_MINUTE, Duration.ofMinutes(1));
        } else {
            limiter.hit("invitation-all", "all", GENERAL_PER_MINUTE, Duration.ofMinutes(1));
        }
        if (token != null && RequestTokens.wellFormed(token)) {
            limiter.hit("invitation-token", RequestTokens.hash(token), PER_TOKEN_PER_MINUTE, Duration.ofMinutes(1));
        }
    }
}
