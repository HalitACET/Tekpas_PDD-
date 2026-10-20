package com.tekpas.passport.dto;

import com.tekpas.passport.snapshot.PassportSnapshot;

/**
 * What the public page shows (docs/m6-plan.md §5.1): the frozen content of the published version and its short
 * verification code. Nothing else: no score, no ids, no company internals.
 */
public record PublicPassportResponse(String verificationCode, PassportSnapshot snapshot) {
}
