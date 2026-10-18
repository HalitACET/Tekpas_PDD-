package com.tekpas.document;

import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * 422: the body is well formed, but a certificate cannot be confirmed without its number and its end of validity.
 * One field error (code NotNull) per missing field, so a form marks both at once.
 */
public class IncompleteCertificateException extends InvalidFieldsException {

    IncompleteCertificateException(List<String> missingFields) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, missingFields.stream()
                .map(field -> new FieldViolation(field, "NotNull", "Required to confirm a certificate"))
                .toArray(FieldViolation[]::new));
    }
}
