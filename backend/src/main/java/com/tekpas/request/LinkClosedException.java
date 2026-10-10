package com.tekpas.request;

import com.tekpas.common.error.ApiException;
import com.tekpas.common.error.ProblemTypes;
import com.tekpas.request.dto.LinkContext;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;

/**
 * The link page's error states (design v0.4 44). Unknown token: 404 LINK_INVALID without context. Expired,
 * revoked or submitted: 410 with the reason and what the holder may still see.
 */
public class LinkClosedException extends ApiException {

    private final String reason;
    private final @Nullable LinkContext link;

    private LinkClosedException(HttpStatus status, String reason, String detail, @Nullable LinkContext link) {
        super(status, status == HttpStatus.GONE ? ProblemTypes.LINK_GONE : ProblemTypes.LINK_INVALID,
                status == HttpStatus.GONE ? "Gone" : "Not found", detail);
        this.reason = reason;
        this.link = link;
    }

    public static LinkClosedException invalid() {
        return new LinkClosedException(HttpStatus.NOT_FOUND, "LINK_INVALID", "No such link", null);
    }

    public static LinkClosedException expired(LinkContext link) {
        return new LinkClosedException(HttpStatus.GONE, "LINK_EXPIRED", "The link has expired", link);
    }

    public static LinkClosedException revoked(LinkContext link) {
        return new LinkClosedException(HttpStatus.GONE, "LINK_REVOKED", "The link was revoked", link);
    }

    public static LinkClosedException submitted(LinkContext link) {
        return new LinkClosedException(HttpStatus.GONE, "ALREADY_SUBMITTED", "The form was already submitted", link);
    }

    public String reason() {
        return reason;
    }

    public @Nullable LinkContext link() {
        return link;
    }
}
