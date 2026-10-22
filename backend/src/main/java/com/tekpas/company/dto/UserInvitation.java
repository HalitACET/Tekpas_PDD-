package com.tekpas.company.dto;

import java.time.Instant;

/**
 * A new invitation link. {@code token} is shown once and never stored (only its SHA-256): the web builds
 * {@code /davet#<token>} from it and offers "copy" and "WhatsApp", as for a supplier's link.
 */
public record UserInvitation(UserResponse user, String token, Instant expiresAt) {
}
