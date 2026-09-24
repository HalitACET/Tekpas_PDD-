package com.tekpas.auth;

import com.tekpas.common.error.ApiException;
import com.tekpas.common.error.ProblemTypes;
import org.springframework.http.HttpStatus;

/** Same response for unknown e-mail, wrong password and inactive user: nothing about the account leaks. */
public class InvalidCredentialsException extends ApiException {

    public InvalidCredentialsException() {
        super(HttpStatus.UNAUTHORIZED, ProblemTypes.INVALID_CREDENTIALS, "Invalid credentials",
                "E-mail or password is incorrect");
    }
}
