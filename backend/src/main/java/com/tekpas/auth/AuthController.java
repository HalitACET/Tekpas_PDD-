package com.tekpas.auth;

import com.tekpas.auth.dto.LoginRequest;
import com.tekpas.auth.dto.LoginResponse;
import com.tekpas.auth.dto.MeResponse;
import com.tekpas.auth.dto.RefreshRequest;
import com.tekpas.auth.dto.TokenResponse;
import com.tekpas.common.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1/auth", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "auth", description = "Login, token refresh, logout and the current user")
public class AuthController {

    private static final String BEARER = "Bearer";

    private final AuthService authService;
    private final RefreshCookies refreshCookies;
    private final CurrentUser currentUser;

    public AuthController(AuthService authService, RefreshCookies refreshCookies, CurrentUser currentUser) {
        this.authService = authService;
        this.refreshCookies = refreshCookies;
        this.currentUser = currentUser;
    }

    @PostMapping("/login")
    @SecurityRequirements
    @Operation(operationId = "login", summary = "Log in with e-mail and password",
            description = "WEB clients receive the refresh token as an httpOnly cookie, MOBILE clients in the body.")
    @ApiResponse(responseCode = "200", description = "Logged in")
    @ApiResponse(responseCode = "400", description = "Validation failed")
    @ApiResponse(responseCode = "401", description = "Invalid credentials")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent) {
        AuthService.Session session = authService.login(request.email(), request.password(), request.client(),
                userAgent);
        LoginResponse body = new LoginResponse(session.accessToken(), BEARER, session.expiresIn(),
                bodyRefreshToken(session), session.user());
        return withRefreshCookie(session).body(body);
    }

    @PostMapping("/refresh")
    @SecurityRequirements
    @Operation(operationId = "refresh", summary = "Rotate the refresh token and issue a new access token",
            description = "Reads the refresh token from the cookie (WEB) or the body (MOBILE). "
                    + "A reused token revokes its whole family.")
    @Parameter(name = RefreshCookies.NAME, in = ParameterIn.COOKIE, required = false)
    @ApiResponse(responseCode = "200", description = "Tokens rotated")
    @ApiResponse(responseCode = "401", description = "Missing, expired, reused or revoked refresh token")
    public ResponseEntity<TokenResponse> refresh(
            @CookieValue(name = RefreshCookies.NAME, required = false) String cookieToken,
            @RequestBody(required = false) RefreshRequest request,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent) {
        AuthService.Session session = authService.refresh(refreshTokenFrom(cookieToken, request), userAgent);
        TokenResponse body = new TokenResponse(session.accessToken(), BEARER, session.expiresIn(),
                bodyRefreshToken(session));
        return withRefreshCookie(session).body(body);
    }

    @PostMapping("/logout")
    @SecurityRequirements
    @Operation(operationId = "logout", summary = "Log out: revoke the refresh token family and clear the cookie",
            description = "Authenticated by the refresh token itself. Always 204, also for missing or unknown tokens.")
    @Parameter(name = RefreshCookies.NAME, in = ParameterIn.COOKIE, required = false)
    @ApiResponse(responseCode = "204", description = "Logged out")
    public ResponseEntity<Void> logout(
            @CookieValue(name = RefreshCookies.NAME, required = false) String cookieToken,
            @RequestBody(required = false) RefreshRequest request) {
        authService.logout(refreshTokenFrom(cookieToken, request));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString())
                .build();
    }

    @GetMapping("/me")
    @Operation(operationId = "getMe", summary = "The current user with company and role")
    @ApiResponse(responseCode = "200", description = "Current user")
    @ApiResponse(responseCode = "401", description = "Missing or invalid access token")
    public MeResponse getMe() {
        return authService.me(currentUser.userId(), currentUser.companyId());
    }

    private ResponseEntity.BodyBuilder withRefreshCookie(AuthService.Session session) {
        ResponseEntity.BodyBuilder response = ResponseEntity.ok();
        if (session.client() == ClientType.WEB) {
            response.header(HttpHeaders.SET_COOKIE, refreshCookies.create(session.refreshToken()).toString());
        }
        return response;
    }

    private static String bodyRefreshToken(AuthService.Session session) {
        return session.client() == ClientType.MOBILE ? session.refreshToken() : null;
    }

    private static String refreshTokenFrom(String cookieToken, RefreshRequest request) {
        if (cookieToken != null && !cookieToken.isBlank()) {
            return cookieToken;
        }
        return request == null ? null : request.refreshToken();
    }
}
