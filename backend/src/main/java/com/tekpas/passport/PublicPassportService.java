package com.tekpas.passport;

import com.tekpas.passport.dto.PublicPassportResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The lookup behind the QR code (docs/m6-plan.md §5.1). The newest version of the code's passport decides: published
 * answers, withdrawn is gone, anything else (never published, unreadable code) is not found. Superseded versions are
 * never returned (decision 8): by the time a version is superseded, a newer published or withdrawn one exists.
 */
@Service
public class PublicPassportService {

    private final PassportRepository passports;

    public PublicPassportService(PassportRepository passports) {
        this.passports = passports;
    }

    @Transactional(readOnly = true)
    public PublicPassportResponse find(String gtin, String batchNo) {
        Gs1DigitalLink.Key key = Gs1DigitalLink.parse(gtin, batchNo).orElseThrow(PassportUnavailableException::notFound);
        Passport latest = passports.findFirstByGtinAndBatchNoOrderByVersionDesc(key.gtin(), key.batchNo())
                .orElseThrow(PassportUnavailableException::notFound);
        return switch (latest.getStatus()) {
            case PUBLISHED -> new PublicPassportResponse(VerificationCode.of(latest.getSnapshotSha256()),
                    latest.getSnapshot());
            case WITHDRAWN -> throw PassportUnavailableException.withdrawn(latest.getWithdrawnAt());
            // Cannot be the newest version; treated as unknown rather than shown.
            case SUPERSEDED -> throw PassportUnavailableException.notFound();
        };
    }
}
