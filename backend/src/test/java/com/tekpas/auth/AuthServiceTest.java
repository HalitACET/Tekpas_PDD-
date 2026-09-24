package com.tekpas.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tekpas.company.AppUserRepository;
import com.tekpas.company.CompanyRepository;
import java.time.Clock;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Timing is not measured directly (flaky); instead we check that an unknown e-mail still pays for a
 * password check, which is what keeps its response time equal to a wrong password.
 */
class AuthServiceTest {

    @Test
    void unknownEmailStillRunsAPasswordCheck() {
        AppUserRepository users = mock(AppUserRepository.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(encoder.encode(anyString())).thenReturn("$2a$10$dummy");
        when(users.findByEmail("nobody@test.example")).thenReturn(Optional.empty());

        AuthService service = new AuthService(users, mock(CompanyRepository.class), encoder,
                mock(AccessTokenService.class), mock(RefreshTokenService.class), Clock.systemUTC());

        assertThatThrownBy(() -> service.login("Nobody@Test.example", "secret", ClientType.WEB, null))
                .isInstanceOf(InvalidCredentialsException.class);
        verify(encoder).matches(eq("secret"), eq("$2a$10$dummy"));
    }
}
