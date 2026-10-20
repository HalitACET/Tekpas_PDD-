package com.tekpas.validation.dto;

/** Open issues of a batch by severity: the tab's badge, the header button and the score card read these. */
public record IssueCounts(int errors, int warnings, int infos) {

    public static final IssueCounts NONE = new IssueCounts(0, 0, 0);

    public int total() {
        return errors + warnings + infos;
    }
}
