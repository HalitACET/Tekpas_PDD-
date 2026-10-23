package com.tekpas.company;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.auth.ClientType;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/**
 * The company's users (M12 T3, docs/m12-plan.md §5): invite with a one-time link, join with it, change roles and
 * deactivate. Only the OWNER changes anything; another company's user is a 404.
 */
@IntegrationTest
class UserApiTest {

    private static final String USERS = "/api/v1/users";
    private static final String PUBLIC = "/api/v1/public/invitation";
    private static final String NEW_PASSWORD = "yeni-sifre-2026";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    MutableClock clock;

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    private static String email() {
        return "davet-" + UUID.randomUUID() + "@test.example";
    }

    private JsonNode invite(Tenant owner, String email, String role) {
        MvcTestResult result = fixtures.post(owner, USERS + "/invitations",
                Map.of("email", email, "fullName", "Selin Arslan", "role", role));
        assertThat(result).hasStatus(201);
        return fixtures.body(result);
    }

    private MvcTestResult open(String token) {
        return fixtures.mvc().get().uri(PUBLIC).header(PublicInvitationController.TOKEN_HEADER, token).exchange();
    }

    private MvcTestResult accept(String token, String password) {
        return fixtures.mvc().post().uri(PUBLIC + "/accept").header(PublicInvitationController.TOKEN_HEADER, token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"" + password + "\"}").exchange();
    }

    private List<String> auditActions(UUID userId) {
        return jdbc.queryForList("SELECT action FROM audit_log WHERE entity_type = 'USER' AND entity_id = ? ORDER BY id",
                String.class, userId);
    }

    @Test
    void theOwnerInvitesAColleagueWhoJoinsWithTheLinkOnceAndLogsIn() {
        Tenant owner = fixtures.tenant();
        String email = email();

        JsonNode invitation = invite(owner, email.toUpperCase(), "EDITOR");

        String token = invitation.path("token").asString();
        assertThat(token).hasSize(43);
        assertThat(invitation.path("user").path("status").asString()).isEqualTo("INVITED");
        assertThat(invitation.path("user").path("email").asString()).isEqualTo(email);
        // Not stored: only its hash is in the database.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_invitation WHERE token_hash = ?", Integer.class,
                token)).isZero();
        // Invited, not joined: no login yet.
        assertThat(fixtures.loginRequest(email, NEW_PASSWORD, ClientType.WEB)).hasStatus(401);

        JsonNode view = fixtures.body(open(token));
        assertThat(view.path("companyName").asString()).isEqualTo(owner.company().getName());
        assertThat(view.path("email").asString()).isEqualTo(email);
        assertThat(view.path("role").asString()).isEqualTo("EDITOR");
        assertThat(view.path("invitedByName").asString()).isEqualTo(owner.user().getFullName());

        assertThat(accept(token, "kisa")).hasStatus(400);
        assertThat(accept(token, NEW_PASSWORD)).hasStatus(204);

        assertThat(fixtures.loginRequest(email, NEW_PASSWORD, ClientType.WEB)).hasStatusOk();
        assertThat(accept(token, NEW_PASSWORD)).hasStatus(410);
        assertThat(fixtures.body(open(token)).path("reason").asString()).isEqualTo("INVITATION_USED");
        JsonNode list = fixtures.body(fixtures.get(owner, USERS));
        JsonNode joined = list.valueStream().filter(u -> u.path("email").asString().equals(email)).findFirst()
                .orElseThrow();
        assertThat(joined.path("status").asString()).isEqualTo("ACTIVE");
        assertThat(auditActions(UUID.fromString(joined.path("id").asString()))).containsExactly("INVITE", "JOIN");
    }

    @Test
    void aLinkRunsOutAfterSevenDaysAndARenewedOneReplacesIt() {
        Tenant owner = fixtures.tenant();
        JsonNode invitation = invite(owner, email(), "VIEWER");
        String first = invitation.path("token").asString();
        String userId = invitation.path("user").path("id").asString();

        MvcTestResult renewed = fixtures.post(owner, USERS + "/" + userId + "/invitations", Map.of());

        assertThat(renewed).hasStatus(201);
        String second = fixtures.body(renewed).path("token").asString();
        assertThat(open(first)).hasStatus(404);
        assertThat(open(second)).hasStatusOk();

        clock.advance(Duration.ofDays(7).plusMinutes(1));
        MvcTestResult expired = open(second);
        assertThat(expired).hasStatus(410);
        JsonNode problem = fixtures.body(expired);
        assertThat(problem.path("reason").asString()).isEqualTo("INVITATION_EXPIRED");
        // Who to ask for a new link (design v1.2 173).
        assertThat(problem.path("invitedByName").asString()).isEqualTo(owner.user().getFullName());
        assertThat(problem.path("companyName").asString()).isEqualTo(owner.company().getName());
        assertThat(open("not-a-token")).hasStatus(404);
    }

    @Test
    void theOwnerChangesARoleAndDeactivatesWhichSignsTheUserOut() {
        Tenant owner = fixtures.tenant();
        Tenant editor = fixtures.member(owner, UserRole.EDITOR);
        String uri = USERS + "/" + editor.user().getId();

        MvcTestResult promoted = fixtures.patch(owner, uri, Map.of("role", "ADMIN"));

        assertThat(promoted).hasStatusOk();
        assertThat(fixtures.body(promoted).path("role").asString()).isEqualTo("ADMIN");
        JsonNode mobileLogin = fixtures.login(editor.user(), ClientType.MOBILE);

        MvcTestResult deactivated = fixtures.patch(owner, uri, Map.of("active", false));
        assertThat(deactivated).hasStatusOk();
        assertThat(fixtures.body(deactivated).path("inactiveSince").isNull()).isFalse();

        assertThat(fixtures.loginRequest(editor.user().getEmail(), TestFixtures.PASSWORD, ClientType.WEB))
                .hasStatus(401);
        MvcTestResult refresh = fixtures.mvc().post().uri("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + mobileLogin.path("refreshToken").asString() + "\"}").exchange();
        assertThat(refresh).hasStatus(401);
        assertThat(auditActions(editor.user().getId())).containsExactly("ROLE", "DEACTIVATE");
        assertThat(jdbc.queryForObject("SELECT diff->>'role' FROM audit_log WHERE entity_id = ? AND action = 'ROLE'",
                String.class, editor.user().getId())).isEqualTo("[\"EDITOR\", \"ADMIN\"]");

        MvcTestResult reactivated = fixtures.patch(owner, uri, Map.of("active", true));
        assertThat(reactivated).hasStatusOk();
        assertThat(fixtures.body(reactivated).path("inactiveSince").isNull()).isTrue();
        assertThat(fixtures.loginRequest(editor.user().getEmail(), TestFixtures.PASSWORD, ClientType.WEB))
                .hasStatusOk();
    }

    @Test
    void nobodyChangesTheirOwnAccountAndAnInvitationIsNotOpenedByHand() {
        Tenant owner = fixtures.tenant();
        JsonNode invited = invite(owner, email(), "EDITOR").path("user");

        MvcTestResult self = fixtures.patch(owner, USERS + "/" + owner.user().getId(), Map.of("role", "VIEWER"));
        MvcTestResult byHand = fixtures.patch(owner, USERS + "/" + invited.path("id").asString(),
                Map.of("active", true));

        assertThat(self).hasStatus(409);
        assertThat(fixtures.body(self).path("reason").asString()).isEqualTo("SELF");
        assertThat(byHand).hasStatus(409);
        assertThat(fixtures.body(byHand).path("reason").asString()).isEqualTo("INVITATION_PENDING");
    }

    @Test
    void wrongRolesAndTakenEmailsAreFieldErrors() {
        Tenant owner = fixtures.tenant();
        String taken = fixtures.member(owner, UserRole.VIEWER).user().getEmail();

        MvcTestResult supplier = fixtures.post(owner, USERS + "/invitations",
                Map.of("email", email(), "fullName", "Tedarikçi", "role", "SUPPLIER"));
        MvcTestResult twice = fixtures.post(owner, USERS + "/invitations",
                Map.of("email", taken, "fullName", "Aynı kişi", "role", "EDITOR"));

        assertThat(supplier).hasStatus(400);
        assertThat(fixtures.body(supplier).path("errors").get(0).path("code").asString()).isEqualTo("InviteRole");
        assertThat(twice).hasStatus(409);
        assertThat(fixtures.body(twice).path("errors").get(0).path("field").asString()).isEqualTo("email");
    }

    @Test
    void onlyTheOwnerChangesAdminsReadOthersSeeNothingAndAnotherCompanyIsNotFound() {
        TenantPair tenants = fixtures.twoTenants();
        Tenant owner = tenants.a();
        Tenant admin = fixtures.member(owner, UserRole.ADMIN);
        Tenant editor = fixtures.member(owner, UserRole.EDITOR);
        Tenant supplier = fixtures.member(owner, UserRole.SUPPLIER);
        Tenant viewer = fixtures.member(owner, UserRole.VIEWER);

        JsonNode list = fixtures.body(fixtures.get(admin, USERS));
        assertThat(list.valueStream().map(u -> u.path("role").asString())).doesNotContain("SUPPLIER");
        assertThat(list.valueStream().filter(u -> u.path("you").asBoolean()).map(u -> u.path("id").asString()))
                .containsExactly(admin.user().getId().toString());
        assertThat(fixtures.post(admin, USERS + "/invitations",
                Map.of("email", email(), "fullName", "X", "role", "VIEWER"))).hasStatus(403);
        assertThat(fixtures.patch(admin, USERS + "/" + editor.user().getId(), Map.of("role", "VIEWER")))
                .hasStatus(403);
        for (Tenant other : List.of(editor, viewer, supplier)) {
            assertThat(fixtures.get(other, USERS)).hasStatus(403);
        }

        assertThat(fixtures.patch(tenants.b(), USERS + "/" + editor.user().getId(), Map.of("role", "VIEWER")))
                .hasStatus(404);
        assertThat(fixtures.post(tenants.b(), USERS + "/" + editor.user().getId() + "/invitations", Map.of()))
                .hasStatus(404);
        // A supplier's user is not managed here.
        assertThat(fixtures.patch(owner, USERS + "/" + supplier.user().getId(), Map.of("active", false)))
                .hasStatus(404);
    }
}
