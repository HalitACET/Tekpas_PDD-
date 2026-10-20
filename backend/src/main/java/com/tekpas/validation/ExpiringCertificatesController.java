package com.tekpas.validation;

import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.validation.dto.ExpiringCertificate;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "issues", description = "Consistency checks of a batch: run them, read the findings, decide on the "
        + "warnings (the panel's Uyarılar tab)")
@ReadAccess
public class ExpiringCertificatesController {

    static final int MAX_DAYS = 365;

    private final ExpiringCertificates service;
    private final CurrentUser currentUser;

    public ExpiringCertificatesController(ExpiringCertificates service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping("/documents/expiring")
    @Operation(operationId = "listExpiringCertificates", summary = "Confirmed certificates ending soon or already ended",
            description = "Closest end first, with the step, supplier and batch each is used in; one that a newer "
                    + "confirmed certificate of the same type replaced is not listed. days is 1–365 (default 30).")
    @ApiResponse(responseCode = "200", description = "The certificates")
    @ApiResponse(responseCode = "400", description = "days is out of range")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    public List<ExpiringCertificate> listExpiringCertificates(@RequestParam(defaultValue = "30") int days) {
        if (days < 1 || days > MAX_DAYS) {
            throw new InvalidFieldsException(new FieldViolation("days", "Range", "Must be between 1 and " + MAX_DAYS));
        }
        return service.within(currentUser.companyId(), days);
    }
}
