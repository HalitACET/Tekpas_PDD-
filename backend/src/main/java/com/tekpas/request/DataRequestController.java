package com.tekpas.request;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.WriteAccess;
import com.tekpas.request.dto.CreatedDataRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "data-requests", description = "Links that let a supplier fill a step without an account (K14, K21)")
@WriteAccess
public class DataRequestController {

    private final DataRequestService service;
    private final CurrentUser currentUser;

    public DataRequestController(DataRequestService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @PostMapping("/steps/{id}/requests")
    @Operation(operationId = "createDataRequest", summary = "Create the step's link (revokes its open one)",
            description = "Valid for 7 days. The token is in this answer only; the web builds {origin}/r#<token>.")
    @ApiResponse(responseCode = "201", description = "The link, once")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such step in this company")
    @ApiResponse(responseCode = "409", description = "No supplier assigned (STEP_HAS_NO_SUPPLIER), or the data "
            + "is already submitted or approved (STEP_NOT_OPEN)")
    public ResponseEntity<CreatedDataRequest> createDataRequest(@PathVariable UUID id) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(currentUser.companyId(), currentUser.userId(), id));
    }

    @PostMapping("/requests/{id}/revoke")
    @Operation(operationId = "revokeDataRequest", summary = "Revoke a link",
            description = "The supplier then sees that the link was revoked and cannot submit.")
    @ApiResponse(responseCode = "204", description = "Revoked")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such link in this company")
    @ApiResponse(responseCode = "409", description = "The link is no longer open (REQUEST_NOT_OPEN)")
    public ResponseEntity<Void> revokeDataRequest(@PathVariable UUID id) {
        service.revoke(currentUser.companyId(), currentUser.userId(), id);
        return ResponseEntity.noContent().build();
    }
}
