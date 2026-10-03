package com.tekpas.common.web;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.Page;

/** One page of a list endpoint. {@code page} is zero-based. */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> of(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(),
                page.getTotalPages());
    }

    public <R> PageResponse<R> map(Function<T, R> mapper) {
        return new PageResponse<>(content.stream().map(mapper).toList(), page, size, totalElements, totalPages);
    }
}
