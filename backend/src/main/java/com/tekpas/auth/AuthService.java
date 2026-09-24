package com.tekpas.auth;

import com.tekpas.auth.dto.MeResponse;
import com.tekpas.auth.dto.UserSummary;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.company.AppUser;
import com.tekpas.company.AppUserRepository;
import com.tekpas.company.Company;
import com.tekpas.company.CompanyRepository;
import java.time.Clock;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final AppUserRepository users;
    private final CompanyRepository companies;
    private final PasswordEncoder passwordEncoder;
    private final AccessTokenService accessTokens;
    private final RefreshTokenService refreshTokens;
    private final Clock clock;

    /**
     * Compared against when the e-mail is unknown, so that "no such user" costs one BCrypt check just
     * like "wrong password" and response time does not reveal which accounts exist.
     */
    private final String dummyHash;

    public AuthService(AppUserRepository users, CompanyRepository companies, PasswordEncoder passwordEncoder,
            AccessTokenService accessTokens, RefreshTokenService refreshTokens, Clock clock) {
        this.users = users;
        this.companies = companies;
        this.passwordEncoder = passwordEncoder;
        this.accessTokens = accessTokens;
        this.refreshTokens = refreshTokens;
        this.clock = clock;
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /** Result of login or refresh; the controller decides whether the refresh token goes to a cookie. */
    public record Session(String accessToken, long expiresIn, String refreshToken, ClientType client,
            UserSummary user) {
    }

    @Transactional
    public Session login(String email, String password, ClientType client, String userAgent) {
        Optional<AppUser> found = users.findByEmail(normalize(email));
        boolean passwordMatches = passwordEncoder.matches(password,
                found.map(AppUser::getPasswordHash).orElse(dummyHash));
        if (found.isEmpty() || !passwordMatches || !found.get().isActive()) {
            throw new InvalidCredentialsException();
        }

        AppUser user = found.get();
        user.recordLogin(clock.instant());
        RefreshTokenService.Issued refresh = refreshTokens.issueNewFamily(user.getId(), client, userAgent);
        return session(user, refresh);
    }

    @Transactional(noRollbackFor = InvalidRefreshTokenException.class)
    public Session refresh(String rawRefreshToken, String userAgent) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw new InvalidRefreshTokenException();
        }
        RefreshTokenService.Issued next = refreshTokens.rotate(rawRefreshToken, userAgent);
        AppUser user = users.findById(next.token().getUserId())
                .filter(AppUser::isActive)
                .orElse(null);
        if (user == null) {
            refreshTokens.revokeFamily(next.token().getFamilyId());
            throw new InvalidRefreshTokenException();
        }
        return session(user, next);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokens.revokeFamilyOf(rawRefreshToken);
    }

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId, UUID companyId) {
        AppUser user = users.findByIdAndCompanyId(userId, companyId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        return MeResponse.from(user, company(user));
    }

    private Session session(AppUser user, RefreshTokenService.Issued refresh) {
        return new Session(accessTokens.issue(user), accessTokens.ttlSeconds(), refresh.rawToken(),
                refresh.token().getClient(), UserSummary.from(user, company(user)));
    }

    private Company company(AppUser user) {
        return companies.findById(user.getCompanyId())
                .orElseThrow(() -> new IllegalStateException("User " + user.getId() + " has no company"));
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
