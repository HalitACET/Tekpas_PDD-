package com.tekpas.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Refresh token issue, rotation and family revocation. Runs inside the caller's transaction; the
 * {@code noRollbackFor} matters: a family revoked while rejecting a reused token must still commit.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY, noRollbackFor = InvalidRefreshTokenException.class)
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);
    private static final int TOKEN_BYTES = 32;
    private static final int USER_AGENT_MAX = 300;

    private final SecureRandom random = new SecureRandom();
    private final RefreshTokenRepository repository;
    private final JwtProperties jwtProperties;
    private final AuthProperties authProperties;
    private final Clock clock;

    public RefreshTokenService(RefreshTokenRepository repository, JwtProperties jwtProperties,
            AuthProperties authProperties, Clock clock) {
        this.repository = repository;
        this.jwtProperties = jwtProperties;
        this.authProperties = authProperties;
        this.clock = clock;
    }

    /** The raw token goes to the client exactly once; only its hash is persisted. */
    public record Issued(String rawToken, RefreshToken token) {
    }

    public Issued issueNewFamily(UUID userId, ClientType client, String userAgent) {
        return issue(userId, UUID.randomUUID(), client, userAgent);
    }

    /**
     * Consumes {@code rawToken} and returns its successor in the same family.
     *
     * <ul>
     *   <li>unknown or expired: rejected</li>
     *   <li>already used within the grace window: rejected, family left alone (parallel tabs)</li>
     *   <li>already used after the grace window, or revoked: whole family revoked, rejected (theft)</li>
     * </ul>
     */
    public Issued rotate(String rawToken, String userAgent) {
        RefreshToken current = repository.findByTokenHash(hash(rawToken))
                .orElseThrow(InvalidRefreshTokenException::new);
        Instant now = clock.instant();

        if (current.getRevokedAt() != null) {
            revokeFamily(current, now);
            throw new InvalidRefreshTokenException();
        }
        if (current.getUsedAt() != null) {
            if (now.isBefore(current.getUsedAt().plus(authProperties.refreshReuseGrace()))) {
                throw new InvalidRefreshTokenException();
            }
            log.warn("Refresh token reuse detected, revoking family {} of user {}",
                    current.getFamilyId(), current.getUserId());
            revokeFamily(current, now);
            throw new InvalidRefreshTokenException();
        }
        if (current.isExpired(now)) {
            throw new InvalidRefreshTokenException();
        }

        current.markUsed(now);
        return issue(current.getUserId(), current.getFamilyId(), current.getClient(), userAgent);
    }

    /** Logout. Unknown tokens are ignored so that logout stays idempotent. */
    public void revokeFamilyOf(String rawToken) {
        find(rawToken).ifPresent(token -> revokeFamily(token, clock.instant()));
    }

    public void revokeFamily(UUID familyId) {
        repository.revokeFamily(familyId, clock.instant());
    }

    private Optional<RefreshToken> find(String rawToken) {
        return rawToken == null || rawToken.isBlank()
                ? Optional.empty()
                : repository.findByTokenHash(hash(rawToken));
    }

    private void revokeFamily(RefreshToken token, Instant now) {
        repository.revokeFamily(token.getFamilyId(), now);
    }

    private Issued issue(UUID userId, UUID familyId, ClientType client, String userAgent) {
        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        RefreshToken token = new RefreshToken(userId, familyId, hash(raw), client,
                clock.instant().plus(jwtProperties.refreshTtl()), truncate(userAgent));
        repository.save(token);
        return new Issued(raw, token);
    }

    static String hash(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private static String truncate(String userAgent) {
        if (userAgent == null) {
            return null;
        }
        return userAgent.length() <= USER_AGENT_MAX ? userAgent : userAgent.substring(0, USER_AGENT_MAX);
    }
}
