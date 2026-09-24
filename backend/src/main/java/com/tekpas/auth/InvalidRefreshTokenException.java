package com.tekpas.auth;

import com.tekpas.common.error.ApiException;
import com.tekpas.common.error.ProblemTypes;
import org.springframework.http.HttpStatus;

/** Missing, unknown, expired, reused or revoked refresh token. The client must log in again. */
public class InvalidRefreshTokenException extends ApiException {

    public InvalidRefreshTokenException() {
        super(HttpStatus.UNAUTHORIZED, ProblemTypes.INVALID_REFRESH_TOKEN, "Invalid refresh token",
                "The session has expired, please log in again");
    }
}
