package com.tekpas.auth.dto;

/** Mobile sends the refresh token in the body; web sends it as a cookie and may omit the body. */
public record RefreshRequest(String refreshToken) {
}
