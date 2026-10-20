package com.tekpas.passport;

import com.tekpas.common.error.ApiException;
import com.tekpas.common.error.ProblemTypes;
import java.time.Instant;
import org.springframework.http.HttpStatus;

/**
 * What the public passport page cannot show: no published passport for the code (404 PASSPORT_NOT_FOUND, also for a
 * batch that was never published, so a draft's existence does not leak) or one the manufacturer withdrew (410
 * PASSPORT_WITHDRAWN, with the date; the reason stays internal).
 */
public class PassportUnavailableException extends ApiException {

    private PassportUnavailableException(HttpStatus status, String title, String reason, String detail) {
        super(status, status == HttpStatus.GONE ? ProblemTypes.PASSPORT_WITHDRAWN : ProblemTypes.PASSPORT_NOT_FOUND,
                title, detail);
        property("reason", reason);
    }

    public static PassportUnavailableException notFound() {
        return new PassportUnavailableException(HttpStatus.NOT_FOUND, "Not found", "PASSPORT_NOT_FOUND",
                "No passport for this code");
    }

    public static PassportUnavailableException withdrawn(Instant withdrawnAt) {
        PassportUnavailableException e = new PassportUnavailableException(HttpStatus.GONE, "Gone",
                "PASSPORT_WITHDRAWN", "The manufacturer withdrew this passport");
        e.property("withdrawnAt", withdrawnAt);
        return e;
    }
}
