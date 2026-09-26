package com.tekpas.auth.dto;

import com.tekpas.auth.ClientType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * @param rememberMe WEB only: false makes the refresh cookie a session cookie. Omitted means true.
 */
public record LoginRequest(
        @NotBlank @Email @Size(max = 200) String email,
        @NotBlank @Size(max = 200) String password,
        @NotNull ClientType client,
        @Nullable Boolean rememberMe) {

    public boolean rememberMeOrDefault() {
        return rememberMe == null || rememberMe;
    }
}
