package com.tekpas.company.dto;

import com.tekpas.document.DocType;
import java.time.LocalDate;

/**
 * A certificate type a supplier holds, as far as the current company has confirmed it (design v0.5 61).
 *
 * @param type OEKO_TEX, GOTS, GRS, BCI, OCS or BLUESIGN
 * @param validUntil the latest end of validity among the confirmed documents of the type
 * @param expired whether that date has passed: no confirmed document of the type is valid any more
 */
public record SupplierCertificate(DocType type, LocalDate validUntil, boolean expired) {
}
