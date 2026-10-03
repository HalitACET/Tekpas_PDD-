package com.tekpas.support;

import com.tekpas.auth.ClientType;
import com.tekpas.company.AppUser;
import com.tekpas.company.AppUserRepository;
import com.tekpas.company.Company;
import com.tekpas.company.CompanyRepository;
import com.tekpas.company.CompanyType;
import com.tekpas.company.UserRole;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Creates isolated companies and users (random names and e-mails, so tests never collide) and logs
 * them in through the real endpoint. Every tenant isolation test starts from {@link #twoTenants()}.
 */
@TestComponent
public class TestFixtures {

    public static final String PASSWORD = "correct-horse-battery";

    private final CompanyRepository companies;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final MockMvcTester mvc;
    private final JsonMapper json;
    private String passwordHash;

    public TestFixtures(CompanyRepository companies, AppUserRepository users, PasswordEncoder passwordEncoder,
            MockMvcTester mvc, JsonMapper json) {
        this.companies = companies;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.mvc = mvc;
        this.json = json;
    }

    /** A company, one of its users and that user's access token. */
    public record Tenant(Company company, AppUser user, String accessToken) {

        public String bearer() {
            return "Bearer " + accessToken;
        }
    }

    public record TenantPair(Tenant a, Tenant b) {
    }

    public TenantPair twoTenants() {
        return new TenantPair(tenant(), tenant());
    }

    public Tenant tenant() {
        return tenant(UserRole.OWNER);
    }

    public Tenant tenant(UserRole role) {
        Company company = company();
        AppUser user = user(company, role);
        return new Tenant(company, user, login(user, ClientType.MOBILE).path("accessToken").asString());
    }

    /** Another user of the tenant's company, logged in. */
    public Tenant member(Tenant tenant, UserRole role) {
        AppUser user = user(tenant.company(), role);
        return new Tenant(tenant.company(), user, login(user, ClientType.MOBILE).path("accessToken").asString());
    }

    public Company company() {
        return companies.save(new Company("Test Co " + shortId(), CompanyType.MANUFACTURER, "Bursa"));
    }

    public AppUser user(Company company, UserRole role) {
        String email = "user-" + shortId() + "@test.example";
        return users.save(new AppUser(company.getId(), email, passwordHash(), "Test User", role));
    }

    public AppUser inactiveUser(Company company) {
        AppUser user = new AppUser(company.getId(), "inactive-" + shortId() + "@test.example", passwordHash(),
                "Inactive User", UserRole.EDITOR);
        user.deactivate();
        return users.save(user);
    }

    public MvcTestResult loginRequest(String email, String password, ClientType client) {
        String body = json.writeValueAsString(new LoginBody(email, password, client));
        return mvc.post().uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    /** Logs in and returns the parsed response body; fails if login does not succeed. */
    public JsonNode login(AppUser user, ClientType client) {
        MvcTestResult result = loginRequest(user.getEmail(), PASSWORD, client);
        if (result.getResponse().getStatus() != 200) {
            throw new IllegalStateException("Login failed with " + result.getResponse().getStatus());
        }
        return body(result);
    }

    public MvcTestResult get(Tenant tenant, String uri) {
        return mvc.get().uri(uri).header(HttpHeaders.AUTHORIZATION, tenant.bearer()).exchange();
    }

    /** {@code body} is sent as is when it is a String (raw JSON, e.g. with explicit nulls), else serialized. */
    public MvcTestResult post(Tenant tenant, String uri, Object body) {
        return mvc.post().uri(uri).header(HttpHeaders.AUTHORIZATION, tenant.bearer())
                .contentType(MediaType.APPLICATION_JSON).content(toJson(body)).exchange();
    }

    public MvcTestResult patch(Tenant tenant, String uri, Object body) {
        return mvc.patch().uri(uri).header(HttpHeaders.AUTHORIZATION, tenant.bearer())
                .contentType(MediaType.APPLICATION_JSON).content(toJson(body)).exchange();
    }

    public MvcTestResult delete(Tenant tenant, String uri) {
        return mvc.delete().uri(uri).header(HttpHeaders.AUTHORIZATION, tenant.bearer()).exchange();
    }

    private String toJson(Object body) {
        return body instanceof String raw ? raw : json.writeValueAsString(body);
    }

    public String responseText(MvcTestResult result) {
        return new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
    }

    public MockMvcTester mvc() {
        return mvc;
    }

    public JsonNode body(MvcTestResult result) {
        return json.readTree(new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8));
    }

    private String passwordHash() {
        if (passwordHash == null) {
            passwordHash = passwordEncoder.encode(PASSWORD);
        }
        return passwordHash;
    }

    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private record LoginBody(String email, String password, ClientType client) {
    }
}
