package com.tekpas.common.security;

import com.tekpas.company.UserRole;
import java.util.UUID;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * The authenticated user of the current request, read from the access token. This is the only source
 * of {@code companyId}: it never comes from the request body, query or path.
 */
@Component
public class CurrentUser {

    public UUID userId() {
        return UUID.fromString(jwt().getSubject());
    }

    public UUID companyId() {
        return UUID.fromString(jwt().getClaimAsString(JwtClaims.COMPANY_ID));
    }

    public UserRole role() {
        return UserRole.valueOf(jwt().getClaimAsString(JwtClaims.ROLE));
    }

    private static Jwt jwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken token) {
            return token.getToken();
        }
        throw new AuthenticationCredentialsNotFoundException("No authenticated user");
    }
}
