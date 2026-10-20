package com.tekpas.validation;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.ReviewAccess;
import com.tekpas.common.security.WriteAccess;
import com.tekpas.validation.dto.IssueListResponse;
import com.tekpas.validation.dto.IssueResponse;
import com.tekpas.validation.dto.ResolveRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "issues", description = "Consistency checks of a batch: run them, read the findings, decide on the "
        + "warnings (the panel's Uyarılar tab)")
@ReadAccess
public class IssueController {

    private final ValidationService service;
    private final CurrentUser currentUser;

    public IssueController(ValidationService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @PostMapping("/batches/{id}/validate")
    @WriteAccess
    @Operation(operationId = "validateBatch", summary = "Run the rule checks of the batch",
            description = "Checks the batch and makes the stored issues say the same: new findings open, findings "
                    + "whose data was corrected close themselves, a warning a person resolved stays resolved. "
                    + "Answers with the open issues.")
    @ApiResponse(responseCode = "200", description = "The open issues after the run")
    @ApiResponse(responseCode = "403", description = "Only OWNER, ADMIN and EDITOR run the checks")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    public IssueListResponse validateBatch(@PathVariable UUID id) {
        return service.validate(currentUser.companyId(), id);
    }

    @GetMapping("/batches/{id}/issues")
    @Operation(operationId = "listBatchIssues", summary = "The issues of the batch, most severe first",
            description = "status picks open ones (default), resolved ones or all; the counts of both sides come "
                    + "with every answer.")
    @ApiResponse(responseCode = "200", description = "The issues")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    public IssueListResponse listBatchIssues(@PathVariable UUID id,
            @RequestParam(defaultValue = "OPEN") IssueFilter status) {
        return service.list(currentUser.companyId(), id, status);
    }

    @PostMapping("/issues/{id}/resolve")
    @ReviewAccess
    @Operation(operationId = "resolveIssue", summary = "Resolve a warning or an info",
            description = "A person lets it stand, with an optional note. A blocking issue cannot be resolved: "
                    + "correct the data and it closes itself.")
    @ApiResponse(responseCode = "200", description = "The resolved issue")
    @ApiResponse(responseCode = "400", description = "The note is longer than 500 characters")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN resolve")
    @ApiResponse(responseCode = "404", description = "No such issue in this company")
    @ApiResponse(responseCode = "409", description = "ISSUE_BLOCKING (an error) or ALREADY_RESOLVED")
    public IssueResponse resolveIssue(@PathVariable UUID id, @RequestBody(required = false) @Valid ResolveRequest body) {
        return service.resolve(currentUser.companyId(), currentUser.userId(), id, body == null ? null : body.note());
    }

    @PostMapping("/issues/{id}/reopen")
    @ReviewAccess
    @Operation(operationId = "reopenIssue", summary = "Take back the decision on a resolved issue",
            description = "Only an issue a person resolved: one that closed itself when its data was corrected "
                    + "comes back by itself if the data goes wrong again.")
    @ApiResponse(responseCode = "200", description = "The reopened issue")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN reopen")
    @ApiResponse(responseCode = "404", description = "No such issue in this company")
    @ApiResponse(responseCode = "409", description = "NOT_RESOLVED or AUTO_RESOLVED")
    public IssueResponse reopenIssue(@PathVariable UUID id) {
        return service.reopen(currentUser.companyId(), id);
    }
}
