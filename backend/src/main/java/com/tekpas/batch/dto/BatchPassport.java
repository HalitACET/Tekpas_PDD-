package com.tekpas.batch.dto;

/**
 * The newest passport version of a batch, for the list and the header (design v0.6): which version, its compliance
 * score as it was when it was published, and whether the manufacturer withdrew it. A batch that was published and is
 * being changed again (status not PUBLISHED, passport not withdrawn) has a draft of the next version open.
 */
public record BatchPassport(int version, int score, boolean withdrawn) {
}
