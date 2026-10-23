package com.tekpas.company;

import com.tekpas.common.error.ApiException;
import com.tekpas.common.error.ProblemTypes;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;

/**
 * An invitation link that cannot be used (design brief v1.2 161): unknown is 404 INVITATION_INVALID; expired or
 * already used is 410 with the reason, so the page can say what to do.
 */
public class InvitationClosedException extends ApiException {

    private InvitationClosedException(HttpStatus status, String reason, String detail) {
        super(status, status == HttpStatus.GONE ? ProblemTypes.LINK_GONE : ProblemTypes.LINK_INVALID,
                status == HttpStatus.GONE ? "Gone" : "Not found", detail);
        property("reason", reason);
    }

    static InvitationClosedException invalid() {
        return new InvitationClosedException(HttpStatus.NOT_FOUND, "INVITATION_INVALID", "No such invitation");
    }

    /** With who to ask for a new link (design v1.2 173). */
    static InvitationClosedException expired(String companyName, @Nullable String invitedByName) {
        InvitationClosedException e = new InvitationClosedException(HttpStatus.GONE, "INVITATION_EXPIRED",
                "The invitation has expired");
        e.property("companyName", companyName);
        if (invitedByName != null) {
            e.property("invitedByName", invitedByName);
        }
        return e;
    }

    static InvitationClosedException used() {
        return new InvitationClosedException(HttpStatus.GONE, "INVITATION_USED", "The invitation was already used");
    }
}
