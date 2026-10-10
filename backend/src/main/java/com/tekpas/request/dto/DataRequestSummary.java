package com.tekpas.request.dto;

import com.tekpas.request.DataRequest;
import com.tekpas.request.RequestStatus;
import com.tekpas.request.RequestTokens;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A step's latest link as the panel shows it (46, 48a), without the token. An open link past its deadline is
 * EXPIRED here even before anyone reads it.
 *
 * @param openCount how often the supplier opened it ("3 kez açıldı")
 */
public record DataRequestSummary(UUID id, String code, RequestStatus status, Instant createdAt, Instant expiresAt,
        int openCount, @Nullable Instant openedAt, @Nullable Instant completedAt) {

    public static DataRequestSummary of(DataRequest request, Instant now) {
        RequestStatus status = request.getStatus().isOpen() && !now.isBefore(request.getExpiresAt())
                ? RequestStatus.EXPIRED : request.getStatus();
        return new DataRequestSummary(request.getId(), RequestTokens.code(request.getId()), status,
                request.getCreatedAt(), request.getExpiresAt(), request.getOpenCount(), request.getOpenedAt(),
                request.getCompletedAt());
    }
}
