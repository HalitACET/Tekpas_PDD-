package com.tekpas.request;

import com.tekpas.batch.Batch;
import com.tekpas.batch.BatchProgress;
import com.tekpas.batch.BatchRepository;
import com.tekpas.company.AppUser;
import com.tekpas.company.AppUserRepository;
import com.tekpas.company.CompanyRepository;
import com.tekpas.product.ProductRepository;
import com.tekpas.request.dto.LinkContext;
import com.tekpas.request.dto.PublicRejection;
import com.tekpas.request.dto.PublicRequestView;
import com.tekpas.request.dto.PublicSubmitRequest;
import com.tekpas.request.dto.PublicSubmitResponse;
import com.tekpas.supplychain.StepDataRules;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The supplier's side of a link (design v0.4 39–45), found by the SHA-256 of the token alone. The holder sees
 * their own step only; nothing here reads the rest of the chain. An expired link is marked EXPIRED when it is
 * read, so the closed-link errors do not roll that back.
 */
@Service
public class PublicRequestService {

    private final DataRequestRepository requests;
    private final SupplyStepRepository steps;
    private final BatchRepository batches;
    private final ProductRepository products;
    private final CompanyRepository companies;
    private final AppUserRepository users;
    private final BatchProgress progress;
    private final StepEvents events;
    private final Clock clock;

    public PublicRequestService(DataRequestRepository requests, SupplyStepRepository steps, BatchRepository batches,
            ProductRepository products, CompanyRepository companies, AppUserRepository users, BatchProgress progress,
            StepEvents events, Clock clock) {
        this.requests = requests;
        this.steps = steps;
        this.batches = batches;
        this.products = products;
        this.companies = companies;
        this.users = users;
        this.progress = progress;
        this.events = events;
        this.clock = clock;
    }

    /** Every opening is counted (48a "3 kez açıldı"); the first one goes into the step history. */
    @Transactional(noRollbackFor = LinkClosedException.class)
    public PublicRequestView open(String token) {
        DataRequest request = find(token);
        Link link = link(request);
        ensureOpen(request, link);
        Instant now = clock.instant();
        if (request.open(now)) {
            events.record(request.getStepId(), request.getId(), StepEventKind.REQUEST_OPENED, null, null, null);
        }
        SupplyStep step = link.step();
        PublicRejection rejection = step.getStatus() == StepStatus.REJECTED && step.getRejectionReason() != null
                ? new PublicRejection(step.getRejectionReason(), step.getRejectionFields(),
                        step.getRejectedAt() == null ? now : step.getRejectedAt(),
                        nameOf(step.getRejectedBy(), link.manufacturerName()))
                : null;
        return new PublicRequestView(RequestTokens.code(request.getId()), link.manufacturerName(),
                link.requesterName(), link.productName(), link.batch().getBatchNo(), step.getStepType(),
                request.getExpiresAt(), step.getData(), rejection);
    }

    /** One submission per link; the step becomes SUBMITTED and waits for the manufacturer (47a). */
    @Transactional(noRollbackFor = LinkClosedException.class)
    public PublicSubmitResponse submit(String token, PublicSubmitRequest body) {
        DataRequest request = find(token);
        Link link = link(request);
        ensureOpen(request, link);
        SupplyStep step = steps.lockById(request.getStepId()).orElseThrow(LinkClosedException::invalid);
        if (step.getStatus() != StepStatus.PENDING && step.getStatus() != StepStatus.REJECTED) {
            throw LinkClosedException.submitted(link.context(request));
        }
        StepDataRules.checkSubmission(step.getStepType(), body.data());
        Instant now = clock.instant();
        String name = body.submitterName().trim();
        String role = body.submitterRole() == null || body.submitterRole().isBlank() ? null : body.submitterRole().trim();
        step.submit(body.data(), now);
        request.complete(name, role, now);
        events.record(step.getId(), request.getId(), StepEventKind.SUBMITTED, null, name, null);
        progress.refresh(step.getBatchId());
        return new PublicSubmitResponse(RequestTokens.code(request.getId()), now, link.manufacturerName());
    }

    private DataRequest find(@Nullable String token) {
        if (token == null || !RequestTokens.wellFormed(token)) {
            throw LinkClosedException.invalid();
        }
        return requests.findByTokenHash(RequestTokens.hash(token)).orElseThrow(LinkClosedException::invalid);
    }

    private void ensureOpen(DataRequest request, Link link) {
        request.expireIfDue(clock.instant());
        switch (request.getStatus()) {
            case EXPIRED -> throw LinkClosedException.expired(link.context(request));
            case REVOKED -> throw LinkClosedException.revoked(link.context(request));
            case COMPLETED -> throw LinkClosedException.submitted(link.context(request));
            case SENT, OPENED -> { }
        }
    }

    /** What a link is about: its step, batch and product, the manufacturer and who asked. */
    private Link link(DataRequest request) {
        SupplyStep step = steps.findById(request.getStepId()).orElseThrow(LinkClosedException::invalid);
        Batch batch = batches.findById(step.getBatchId()).orElseThrow(LinkClosedException::invalid);
        String manufacturer = companies.findById(batch.getCompanyId()).orElseThrow().getName();
        String product = products.findById(batch.getProductId()).orElseThrow().getName();
        return new Link(step, batch, manufacturer, nameOf(request.getCreatedBy(), manufacturer), product);
    }

    private String nameOf(@Nullable UUID userId, String fallback) {
        return userId == null ? fallback : users.findById(userId).map(AppUser::getFullName).orElse(fallback);
    }

    private record Link(SupplyStep step, Batch batch, String manufacturerName, String requesterName,
            String productName) {

        LinkContext context(DataRequest request) {
            boolean submitted = request.getStatus() == RequestStatus.COMPLETED;
            return new LinkContext(manufacturerName, requesterName, step.getStepType(), request.getExpiresAt(),
                    submitted ? request.getSubmitterName() : null, submitted ? request.getCompletedAt() : null,
                    submitted ? RequestTokens.code(request.getId()) : null);
        }
    }
}
