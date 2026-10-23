package com.tekpas.company;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    /** Login lookup; callers pass a trimmed, lower-cased address. */
    Optional<AppUser> findByEmail(String email);

    Optional<AppUser> findByIdAndCompanyId(UUID id, UUID companyId);

    long countByCompanyIdAndRoleAndActiveTrue(UUID companyId, UserRole role);

    List<AppUser> findByCompanyIdAndRoleNot(UUID companyId, UserRole role);

    /** The company's owner to name ("ask Selim Karaca"); the first by name when there are several. */
    Optional<AppUser> findFirstByCompanyIdAndRoleAndActiveTrueOrderByFullNameAsc(UUID companyId, UserRole role);
}
