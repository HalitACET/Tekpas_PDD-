package com.tekpas.audit;

import com.tekpas.audit.dto.AuditPage;
import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReviewAccess;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1/audit", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "audit", description = "Who changed what and when (PLAN M12, docs/m12-plan.md §6)")
@ReviewAccess
public class AuditController {

    private final AuditService service;
    private final CurrentUser currentUser;

    public AuditController(AuditService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(operationId = "listAudit", summary = "The company's audit trail, newest first",
            description = "Filters combine; entityType may repeat (STEP and DOCUMENT are \"steps and documents\"). "
                    + "Days are Turkish days (Europe/Istanbul). 25 entries a page, at most 100; page is 0-based.")
    @ApiResponse(responseCode = "200", description = "A page of entries")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN")
    public AuditPage listAudit(@RequestParam(required = false) @Nullable List<String> entityType,
            @RequestParam(required = false) @Nullable UUID userId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) @Nullable LocalDate to,
            @RequestParam(required = false) @Nullable UUID batchId,
            @RequestParam(required = false) @Nullable Integer page,
            @RequestParam(required = false) @Nullable Integer size) {
        return service.list(currentUser.companyId(), entityType, userId, from, to, batchId, page, size);
    }
}
