package com.tekpas.document.dto;

import com.tekpas.document.DocType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import org.jspecify.annotations.Nullable;

/**
 * What a person confirms for a document (design v0.5 57): the document's type and the values as they should
 * stand, whether they kept the proposal, corrected it or typed them. The full set is sent every time: a field
 * left out is a field left empty. The server compares each value with the reading's proposal to record whether it
 * was accepted, edited or added.
 *
 * @param docType the type; not UNKNOWN (UNKNOWN only means "nobody said yet")
 * @param certNo certificate number as printed
 * @param holderName the company the certificate is issued to
 * @param issuer the certification body
 * @param validFrom start of validity or date of issue
 * @param validUntil end of validity; may be in the past (the certificate is expired, which is flagged elsewhere)
 */
public record VerifyDocumentRequest(@NotNull DocType docType, @Nullable @Size(max = 100) String certNo,
        @Nullable @Size(max = 200) String holderName, @Nullable @Size(max = 200) String issuer,
        @Nullable LocalDate validFrom, @Nullable LocalDate validUntil) {
}
