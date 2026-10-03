package com.tekpas.common.web;

import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import java.util.Locale;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/** Paging and sorting for list endpoints: {@code ?page&size&sort=field,asc|desc}, sort fields whitelisted. */
public final class PageQuery {

    public static final int MAX_SIZE = 100;

    private PageQuery() {
    }

    /**
     * @param allowed API sort field → entity property; anything else is a 400 on {@code sort}
     */
    public static Pageable of(int page, int size, @Nullable String sort, Map<String, String> allowed,
            Sort defaultSort) {
        return PageRequest.of(page, size, sort(sort, allowed, defaultSort));
    }

    static Sort sort(@Nullable String sort, Map<String, String> allowed, Sort defaultSort) {
        if (sort == null || sort.isBlank()) {
            return defaultSort;
        }
        String[] parts = sort.split(",", -1);
        String property = allowed.get(parts[0].trim());
        String direction = parts.length > 1 ? parts[1].trim().toLowerCase(Locale.ROOT) : "asc";
        if (property == null || parts.length > 2 || !(direction.equals("asc") || direction.equals("desc"))) {
            throw new InvalidFieldsException(new FieldViolation("sort", "SortField",
                    "Sort by one of " + allowed.keySet().stream().sorted().toList() + ", optionally ,asc or ,desc"));
        }
        Sort.Order order = direction.equals("asc") ? Sort.Order.asc(property) : Sort.Order.desc(property);
        // A stable tie-breaker so that paging never repeats or skips rows with equal sort values.
        return Sort.by(order, Sort.Order.desc("id"));
    }

    /** {@code q} as a case-insensitive "contains" pattern with LIKE wildcards escaped (escape character \). */
    public static @Nullable String containsPattern(@Nullable String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        String escaped = q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
