package com.tekpas.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/** {@code refreshToken} is present only for MOBILE clients; WEB gets it as a cookie. */
public record TokenResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        @JsonInclude(JsonInclude.Include.NON_NULL) String refreshToken) {
}
