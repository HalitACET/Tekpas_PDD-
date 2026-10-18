package com.tekpas.document.reading;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Dates as certificates print them: day first (31.03.2027, 31/03/2027, 31-03-2027), ISO (2027-03-31), or with the
 * month's name in English or Turkish (31 March 2027, 31 Mart 2027). A day-first date is never read month-first.
 */
final class Dates {

    private static final Pattern NUMERIC = Pattern.compile("\\b(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})\\b");
    private static final Pattern ISO = Pattern.compile("\\b(\\d{4})-(\\d{2})-(\\d{2})\\b");
    private static final Map<String, Integer> MONTHS = Map.ofEntries(
            Map.entry("january", 1), Map.entry("february", 2), Map.entry("march", 3), Map.entry("april", 4),
            Map.entry("may", 5), Map.entry("june", 6), Map.entry("july", 7), Map.entry("august", 8),
            Map.entry("september", 9), Map.entry("october", 10), Map.entry("november", 11),
            Map.entry("december", 12), Map.entry("ocak", 1), Map.entry("şubat", 2), Map.entry("mart", 3),
            Map.entry("nisan", 4), Map.entry("mayıs", 5), Map.entry("haziran", 6), Map.entry("temmuz", 7),
            Map.entry("ağustos", 8), Map.entry("eylül", 9), Map.entry("ekim", 10), Map.entry("kasım", 11),
            Map.entry("aralık", 12));
    private static final Pattern NAMED = Pattern.compile("\\b(\\d{1,2})\\.? (\\p{L}+) (\\d{4})\\b",
            Pattern.UNICODE_CHARACTER_CLASS);

    private record Found(int at, LocalDate date) {
    }

    private Dates() {
    }

    /** Every date in {@code text}, in the order they appear. */
    static List<LocalDate> all(String text) {
        List<Found> found = new ArrayList<>();
        Matcher iso = ISO.matcher(text);
        while (iso.find()) {
            add(found, iso.start(), iso.group(1), iso.group(2), iso.group(3));
        }
        Matcher numeric = NUMERIC.matcher(text);
        while (numeric.find()) {
            if (found.stream().noneMatch(f -> f.at() == numeric.start())) {
                add(found, numeric.start(), numeric.group(3), numeric.group(2), numeric.group(1));
            }
        }
        Matcher named = NAMED.matcher(text);
        while (named.find()) {
            Integer month = MONTHS.get(named.group(2).toLowerCase(Locale.forLanguageTag("tr")));
            if (month == null) {
                month = MONTHS.get(named.group(2).toLowerCase(Locale.ROOT));
            }
            if (month != null) {
                add(found, named.start(), named.group(3), String.valueOf(month), named.group(1));
            }
        }
        found.sort(java.util.Comparator.comparingInt(Found::at));
        return found.stream().map(Found::date).toList();
    }

    private static void add(List<Found> found, int at, String year, String month, String day) {
        try {
            found.add(new Found(at, LocalDate.of(Integer.parseInt(year), Integer.parseInt(month),
                    Integer.parseInt(day))));
        } catch (DateTimeException | NumberFormatException e) {
            // 31.02.2027 and the like are not dates.
        }
    }
}
