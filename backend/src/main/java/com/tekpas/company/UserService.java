package com.tekpas.company;

import com.tekpas.auth.RefreshTokenService;
import com.tekpas.common.audit.AuditLog;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.company.InvitationStore.Invitation;
import com.tekpas.company.dto.PublicInvitationView;
import com.tekpas.company.dto.UserInvitation;
import com.tekpas.company.dto.UserInviteRequest;
import com.tekpas.company.dto.UserResponse;
import com.tekpas.company.dto.UserStatus;
import com.tekpas.company.dto.UserUpdateRequest;
import com.tekpas.request.RequestTokens;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The company's users (M12 T3, docs/m12-plan.md §5): the OWNER invites a colleague with a one-time link (no e-mail),
 * changes roles and deactivates. The company's last active OWNER stays one; nobody changes their own account here.
 * Suppliers' users are not managed here: for this service they do not exist (404).
 */
@Service
public class UserService {

    /** How long an invitation link works (as a supplier's link). */
    static final Duration INVITATION_VALIDITY = Duration.ofDays(7);

    private final AppUserRepository users;
    private final CompanyRepository companies;
    private final InvitationStore invitations;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokens;
    private final AuditLog audit;
    private final Clock clock;

    public UserService(AppUserRepository users, CompanyRepository companies, InvitationStore invitations,
            PasswordEncoder passwordEncoder, RefreshTokenService refreshTokens, AuditLog audit, Clock clock) {
        this.users = users;
        this.companies = companies;
        this.invitations = invitations;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokens = refreshTokens;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<UserResponse> list(UUID companyId, UUID askingUserId) {
        return users.findByCompanyIdAndRoleNot(companyId, UserRole.SUPPLIER).stream()
                .sorted(Comparator.comparing(AppUser::getFullName, String.CASE_INSENSITIVE_ORDER))
                .map(u -> response(u, askingUserId)).toList();
    }

    @Transactional
    public UserInvitation invite(UUID companyId, UUID inviterId, UserInviteRequest request) {
        requireTeamRole(request.role());
        String email = request.email().strip().toLowerCase(Locale.ROOT);
        if (users.findByEmail(email).isPresent()) {
            throw ConflictException.taken("email", "This e-mail is already registered");
        }
        // Flushed: the invitation row (JDBC) refers to it.
        AppUser user = users.saveAndFlush(AppUser.invited(companyId, email,
                passwordEncoder.encode(RequestTokens.generate()), request.fullName().strip(), request.role()));
        String token = RequestTokens.generate();
        Instant expiresAt = clock.instant().plus(INVITATION_VALIDITY);
        invitations.replace(companyId, user.getId(), RequestTokens.hash(token), inviterId, expiresAt);
        audit.record(companyId, inviterId, "USER", user.getId(), "INVITE", Map.of("role", request.role().name()));
        return new UserInvitation(response(user, inviterId), token, expiresAt);
    }

    /** A new link for someone who has not joined yet; the old one stops working. */
    @Transactional
    public UserInvitation renewInvitation(UUID companyId, UUID inviterId, UUID userId) {
        AppUser user = find(companyId, userId);
        if (status(user).equals(UserStatus.ACTIVE) || status(user).equals(UserStatus.INACTIVE)) {
            throw ConflictException.state("NOT_INVITED", "The user has already joined");
        }
        String token = RequestTokens.generate();
        Instant expiresAt = clock.instant().plus(INVITATION_VALIDITY);
        invitations.replace(companyId, user.getId(), RequestTokens.hash(token), inviterId, expiresAt);
        audit.record(companyId, inviterId, "USER", user.getId(), "INVITE_RENEW", null);
        return new UserInvitation(response(user, inviterId), token, expiresAt);
    }

    @Transactional
    public UserResponse update(UUID companyId, UUID actorId, UUID userId, UserUpdateRequest request) {
        AppUser user = find(companyId, userId);
        if (user.getId().equals(actorId)) {
            throw ConflictException.state("SELF", "You cannot change your own role or deactivate yourself");
        }
        if (request.role() != null) {
            requireTeamRole(request.role());
        }
        UserRole newRole = request.role() != null ? request.role() : user.getRole();
        boolean newActive = request.active() != null ? request.active() : user.isActive();
        boolean leavesOwners = user.getRole() == UserRole.OWNER && user.isActive()
                && (newRole != UserRole.OWNER || !newActive);
        if (leavesOwners && users.countByCompanyIdAndRoleAndActiveTrue(companyId, UserRole.OWNER) <= 1) {
            throw ConflictException.state("LAST_OWNER", "The company's last owner stays an active owner");
        }
        if (newActive && !user.isActive() && invitationPending(user)) {
            throw ConflictException.state("INVITATION_PENDING",
                    "The user has not joined yet; renew the invitation instead");
        }

        Map<String, Object> diff = new LinkedHashMap<>();
        if (newRole != user.getRole()) {
            diff.put("role", List.of(user.getRole().name(), newRole.name()));
            user.changeRole(newRole);
        }
        if (newActive != user.isActive()) {
            diff.put("active", List.of(user.isActive(), newActive));
            if (newActive) {
                user.activate();
            } else {
                user.deactivate(clock.instant());
                refreshTokens.revokeAllOf(user.getId());
            }
        }
        if (!diff.isEmpty()) {
            audit.record(companyId, actorId, "USER", user.getId(), diff.containsKey("active")
                    ? (newActive ? "ACTIVATE" : "DEACTIVATE") : "ROLE", diff);
        }
        return response(user, actorId);
    }

    /** The invited person's view of the link (no login). */
    @Transactional(readOnly = true)
    public PublicInvitationView open(@Nullable String token) {
        Invitation invitation = usable(token);
        AppUser user = users.findById(invitation.userId()).orElseThrow(InvitationClosedException::invalid);
        String companyName = companies.findById(invitation.companyId()).map(Company::getName).orElse("");
        String invitedBy = invitation.invitedBy() == null ? null
                : users.findById(invitation.invitedBy()).map(AppUser::getFullName).orElse(null);
        return new PublicInvitationView(companyName, user.getFullName(), user.getEmail(), user.getRole(), invitedBy,
                invitation.expiresAt());
    }

    /** The invited person chooses a password; the account opens and the link is used up. */
    @Transactional
    public void accept(@Nullable String token, String password) {
        Invitation invitation = usable(token);
        AppUser user = users.findById(invitation.userId()).orElseThrow(InvitationClosedException::invalid);
        user.acceptInvitation(passwordEncoder.encode(password));
        invitations.markUsed(invitation.id(), clock.instant());
        audit.record(invitation.companyId(), user.getId(), "USER", user.getId(), "JOIN", null);
    }

    private Invitation usable(@Nullable String token) {
        if (token == null || !RequestTokens.wellFormed(token)) {
            throw InvitationClosedException.invalid();
        }
        Invitation invitation = invitations.byTokenHash(RequestTokens.hash(token))
                .orElseThrow(InvitationClosedException::invalid);
        if (invitation.usedAt() != null) {
            throw InvitationClosedException.used();
        }
        if (!invitation.expiresAt().isAfter(clock.instant())) {
            throw InvitationClosedException.expired(
                    companies.findById(invitation.companyId()).map(Company::getName).orElse(""),
                    invitation.invitedBy() == null ? null
                            : users.findById(invitation.invitedBy()).map(AppUser::getFullName).orElse(null));
        }
        return invitation;
    }

    private AppUser find(UUID companyId, UUID userId) {
        return users.findByIdAndCompanyId(userId, companyId).filter(u -> u.getRole() != UserRole.SUPPLIER)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    private static void requireTeamRole(UserRole role) {
        if (role == UserRole.SUPPLIER) {
            throw new InvalidFieldsException(new FieldViolation("role", "InviteRole",
                    "Suppliers' users are not invited here"));
        }
    }

    /** Invited and not joined yet: the account was never opened. */
    private boolean invitationPending(AppUser user) {
        return user.getLastLoginAt() == null && invitations.latestOf(user.getCompanyId(), user.getId())
                .map(i -> i.usedAt() == null).orElse(false);
    }

    private UserStatus status(AppUser user) {
        if (user.isActive()) {
            return UserStatus.ACTIVE;
        }
        Optional<Invitation> latest = invitations.latestOf(user.getCompanyId(), user.getId());
        if (latest.isPresent() && latest.get().usedAt() == null) {
            return latest.get().expiresAt().isAfter(clock.instant()) ? UserStatus.INVITED
                    : UserStatus.INVITATION_EXPIRED;
        }
        return UserStatus.INACTIVE;
    }

    private UserResponse response(AppUser user, UUID askingUserId) {
        UserStatus status = status(user);
        Instant expires = status == UserStatus.INVITED || status == UserStatus.INVITATION_EXPIRED
                ? invitations.latestOf(user.getCompanyId(), user.getId()).map(Invitation::expiresAt).orElse(null)
                : null;
        return new UserResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole(), status,
                user.getLastLoginAt(), expires, status == UserStatus.INACTIVE ? user.getDeactivatedAt() : null,
                user.getId().equals(askingUserId));
    }
}
