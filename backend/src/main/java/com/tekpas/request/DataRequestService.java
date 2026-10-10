package com.tekpas.request;

import com.tekpas.batch.BatchProgress;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.request.dto.CreatedDataRequest;
import com.tekpas.request.dto.DataRequestSummary;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The panel side of data requests (design v0.4 46): a link per step, valid for 7 days. A new link revokes the
 * step's open one, so a step has at most one (V6 partial unique index).
 */
@Service
public class DataRequestService {

    static final int DEFAULT_DAYS = 7;
    static final Set<Integer> DAYS = Set.of(3, 7, 14);
    private static final Set<RequestStatus> OPEN = EnumSet.of(RequestStatus.SENT, RequestStatus.OPENED);

    private final DataRequestRepository requests;
    private final SupplyStepRepository steps;
    private final BatchProgress progress;
    private final StepEvents events;
    private final Clock clock;

    public DataRequestService(DataRequestRepository requests, SupplyStepRepository steps, BatchProgress progress,
            StepEvents events, Clock clock) {
        this.requests = requests;
        this.steps = steps;
        this.progress = progress;
        this.events = events;
        this.clock = clock;
    }

    /** Only a step with a supplier, waiting for data (PENDING) or for a correction (REJECTED). */
    @Transactional
    public CreatedDataRequest create(UUID companyId, UUID userId, UUID stepId, @Nullable Integer validDays) {
        int days = days(validDays);
        SupplyStep step = steps.lockForUpdate(stepId, companyId)
                .orElseThrow(() -> new NotFoundException("Step not found"));
        if (step.getSupplierCompanyId() == null) {
            throw ConflictException.state("STEP_HAS_NO_SUPPLIER", "Assign a supplier before requesting data");
        }
        if (step.getStatus() != StepStatus.PENDING && step.getStatus() != StepStatus.REJECTED) {
            throw ConflictException.state("STEP_NOT_OPEN", "The step's data was already submitted");
        }
        // Postgres keeps microseconds: the answer shows the deadline exactly as it is stored.
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        for (DataRequest open : requests.findByStepIdAndStatusIn(stepId, OPEN)) {
            open.revoke(userId, now);
            events.record(stepId, open.getId(), StepEventKind.REQUEST_REVOKED, userId, null, null);
        }
        requests.flush();
        String token = RequestTokens.generate();
        DataRequest request = requests.saveAndFlush(
                new DataRequest(stepId, RequestTokens.hash(token), now.plus(Duration.ofDays(days)), userId, now));
        events.record(stepId, request.getId(), StepEventKind.REQUEST_CREATED, userId, null, null);
        progress.refresh(step.getBatchId());
        return new CreatedDataRequest(request.getId(), RequestTokens.code(request.getId()), token,
                request.getCreatedAt(), request.getExpiresAt(), days);
    }

    /** 46a: another of 3, 7 or 14 days from the link's creation, while it is open and the new deadline is ahead. */
    @Transactional
    public DataRequestSummary changeDeadline(UUID companyId, UUID userId, UUID requestId, @Nullable Integer validDays) {
        int days = days(validDays);
        DataRequest request = requests.lockForUpdate(requestId, companyId)
                .orElseThrow(() -> new NotFoundException("Request not found"));
        Instant now = clock.instant();
        if (!request.getStatus().isOpen() || !now.isBefore(request.getExpiresAt())) {
            throw ConflictException.state("REQUEST_NOT_OPEN", "The link is no longer open");
        }
        Instant deadline = request.getCreatedAt().plus(Duration.ofDays(days));
        if (!now.isBefore(deadline)) {
            throw ConflictException.state("DEADLINE_PASSED", "The new deadline would already be over");
        }
        request.changeDeadline(deadline);
        events.record(request.getStepId(), requestId, StepEventKind.REQUEST_DEADLINE_CHANGED, userId, null,
                Map.of("validDays", days));
        return DataRequestSummary.of(request, now);
    }

    private static int days(@Nullable Integer validDays) {
        if (validDays == null) {
            return DEFAULT_DAYS;
        }
        if (!DAYS.contains(validDays)) {
            throw new InvalidFieldsException(new FieldViolation("validDays", "OneOf", "3, 7 or 14 days",
                    Map.of("allowed", List.of(3, 7, 14))));
        }
        return validDays;
    }

    /** The supplier then sees "Bu bağlantı geri alındı" (44) and cannot submit. */
    @Transactional
    public void revoke(UUID companyId, UUID userId, UUID requestId) {
        DataRequest request = requests.lockForUpdate(requestId, companyId)
                .orElseThrow(() -> new NotFoundException("Request not found"));
        Instant now = clock.instant();
        if (!request.getStatus().isOpen() || !now.isBefore(request.getExpiresAt())) {
            throw ConflictException.state("REQUEST_NOT_OPEN", "The link is no longer open");
        }
        request.revoke(userId, now);
        events.record(request.getStepId(), requestId, StepEventKind.REQUEST_REVOKED, userId, null, null);
    }
}
