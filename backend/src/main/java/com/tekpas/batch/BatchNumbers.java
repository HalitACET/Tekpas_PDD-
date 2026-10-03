package com.tekpas.batch;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Suggested batch numbers: {@code KP-YYYY-MMDD-A}, then B, C, ... Z, AA, AB, ... per company and day
 * (Europe/Istanbul). Fits GS1 AI(10): at most 20 characters of A–Z, 0–9 and '-'.
 */
@Component
public class BatchNumbers {

    static final ZoneId ZONE = ZoneId.of("Europe/Istanbul");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MMdd");

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public BatchNumbers(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** The next number for today, without reserving it (the form shows it as a suggestion). */
    public String peek(UUID companyId) {
        String prefix = prefix(LocalDate.ofInstant(clock.instant(), ZONE));
        return prefix + letters(highestSequence(companyId, prefix) + 1);
    }

    /**
     * The next number for a batch being created in the current transaction. A per-company advisory lock, held
     * until commit, keeps two concurrent creates from getting the same letter.
     */
    public String next(UUID companyId) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "batch-no:" + companyId);
        return peek(companyId);
    }

    private int highestSequence(UUID companyId, String prefix) {
        Pattern own = Pattern.compile(Pattern.quote(prefix) + "([A-Z]+)");
        return jdbc.queryForList("SELECT batch_no FROM batch WHERE company_id = ? AND batch_no LIKE ?",
                        String.class, companyId, prefix + "%")
                .stream()
                .map(own::matcher)
                .filter(Matcher::matches)
                .mapToInt(m -> sequence(m.group(1)))
                .max()
                .orElse(0);
    }

    static String prefix(LocalDate day) {
        return "KP-" + DAY.format(day) + "-";
    }

    /** 1 → A, 26 → Z, 27 → AA (bijective base 26, like spreadsheet columns). */
    static String letters(int sequence) {
        StringBuilder out = new StringBuilder();
        for (int n = sequence; n > 0; n = (n - 1) / 26) {
            out.insert(0, (char) ('A' + (n - 1) % 26));
        }
        return out.toString();
    }

    static int sequence(String letters) {
        int n = 0;
        for (char c : letters.toCharArray()) {
            n = n * 26 + (c - 'A' + 1);
        }
        return n;
    }
}
