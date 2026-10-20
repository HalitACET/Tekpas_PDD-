package com.tekpas.passport.dto;

import com.tekpas.passport.snapshot.PassportSnapshot;

/** A version with the frozen content (the panel's view of an old version, docs/m6-plan.md §9 decision 8). */
public record PassportDetailResponse(PassportVersionResponse version, PassportSnapshot snapshot) {
}
