package com.tekpas.company;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    /** Login lookup; callers pass a trimmed, lower-cased address. */
    Optional<AppUser> findByEmail(String email);

    Optional<AppUser> findByIdAndCompanyId(UUID id, UUID companyId);
}
