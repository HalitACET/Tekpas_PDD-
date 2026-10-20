package com.tekpas.passport;

import com.tekpas.batch.dto.BatchResponse;
import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.ReviewAccess;
import com.tekpas.passport.dto.PassportDetailResponse;
import com.tekpas.passport.dto.PassportVersionResponse;
import com.tekpas.passport.dto.WithdrawRequest;
import com.tekpas.passport.snapshot.PassportSnapshot;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "passports", description = "Passport versions of a batch: publish, preview, withdraw (the panel; the "
        + "public page is a separate, login-free endpoint)")
@ReadAccess
public class PassportController {

    private final PassportService service;
    private final CurrentUser currentUser;

    public PassportController(PassportService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @PostMapping("/batches/{id}/passports")
    @ReviewAccess
    @Operation(operationId = "publishPassport", summary = "Publish a new version of the batch's passport",
            description = "The server computes the compliance score and refuses (409 PUBLISH_BLOCKED, with blockers) "
                    + "while anything blocks. The snapshot is frozen; the previous version becomes SUPERSEDED.")
    @ApiResponse(responseCode = "201", description = "Published")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN publish")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    @ApiResponse(responseCode = "409", description = "PUBLISH_BLOCKED (blockers in the body) or ALREADY_PUBLISHED")
    public ResponseEntity<PassportVersionResponse> publishPassport(@PathVariable UUID id) {
        PassportVersionResponse created = service.publish(currentUser.companyId(), currentUser.userId(), id);
        return ResponseEntity.created(URI.create("/api/v1/passports/" + created.id())).body(created);
    }

    @GetMapping("/batches/{id}/passport-preview")
    @Operation(operationId = "previewPassport", summary = "The passport as it would be published now, nothing saved",
            description = "Steps that are not approved show as such, without data. Panel only.")
    @ApiResponse(responseCode = "200", description = "The snapshot")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    public PassportSnapshot previewPassport(@PathVariable UUID id) {
        return service.preview(currentUser.companyId(), id);
    }

    @GetMapping("/batches/{id}/passports")
    @Operation(operationId = "listPassportVersions", summary = "The versions of the batch's passport, newest first")
    @ApiResponse(responseCode = "200", description = "The versions")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    public List<PassportVersionResponse> listPassportVersions(@PathVariable UUID id) {
        return service.versions(currentUser.companyId(), id);
    }

    @PostMapping(path = "/batches/{id}/passports/draft")
    @ReviewAccess
    @Operation(operationId = "openPassportDraft", summary = "Open the batch for a new version",
            description = "The published version stays published and keeps answering the QR code; the batch can be "
                    + "changed again and the next publishing makes a new version.")
    @ApiResponse(responseCode = "200", description = "The batch, editable again")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    @ApiResponse(responseCode = "409", description = "BATCH_NOT_PUBLISHED")
    public BatchResponse openPassportDraft(@PathVariable UUID id) {
        return service.openDraft(currentUser.companyId(), currentUser.userId(), id);
    }

    @GetMapping("/passports/{id}")
    @Operation(operationId = "getPassport", summary = "One version with its frozen content",
            description = "Panel only: old versions are not public (docs/m6-plan.md §9 decision 8).")
    @ApiResponse(responseCode = "200", description = "The version and its snapshot")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such passport in this company")
    public PassportDetailResponse getPassport(@PathVariable UUID id) {
        return service.detail(currentUser.companyId(), id);
    }

    @GetMapping(path = "/passports/{id}/qr.png", produces = MediaType.IMAGE_PNG_VALUE)
    @Operation(operationId = "getPassportQrPng", summary = "The QR code of the passport address as a PNG",
            description = "The GS1 Digital Link without a version: the same code shows whichever version is current. "
                    + "Only the code is drawn (error correction M, quiet zone 4). size: 512 (default) or 1024.")
    @ApiResponse(responseCode = "200", description = "The image",
            content = @Content(mediaType = MediaType.IMAGE_PNG_VALUE, schema = @Schema(type = "string", format = "binary")))
    @ApiResponse(responseCode = "400", description = "size is not 512 or 1024")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such passport in this company")
    public ResponseEntity<byte[]> getPassportQrPng(@PathVariable UUID id,
            @RequestParam(defaultValue = "512") int size) {
        PassportService.Qr qr = service.qrPng(currentUser.companyId(), id, size);
        return image(qr, MediaType.IMAGE_PNG, "png");
    }

    @GetMapping(path = "/passports/{id}/qr.svg", produces = "image/svg+xml")
    @Operation(operationId = "getPassportQrSvg", summary = "The QR code of the passport address as an SVG (for print)")
    @ApiResponse(responseCode = "200", description = "The image",
            content = @Content(mediaType = "image/svg+xml", schema = @Schema(type = "string")))
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such passport in this company")
    public ResponseEntity<byte[]> getPassportQrSvg(@PathVariable UUID id) {
        return image(service.qrSvg(currentUser.companyId(), id), MediaType.parseMediaType("image/svg+xml"), "svg");
    }

    private static ResponseEntity<byte[]> image(PassportService.Qr qr, MediaType type, String extension) {
        return ResponseEntity.ok().contentType(type)
                .header("Content-Disposition", "inline; filename=\"qr-" + qr.batchNo() + "." + extension + "\"")
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate()).body(qr.bytes());
    }

    @PostMapping(path = "/passports/{id}/withdraw", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ReviewAccess
    @Operation(operationId = "withdrawPassport", summary = "Withdraw the published version",
            description = "The QR code then says the passport was withdrawn. The batch can be changed again; there is "
                    + "no way back to an older version.")
    @ApiResponse(responseCode = "200", description = "Withdrawn")
    @ApiResponse(responseCode = "400", description = "A reason is required")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN")
    @ApiResponse(responseCode = "404", description = "No such passport in this company")
    @ApiResponse(responseCode = "409", description = "NOT_PUBLISHED: only the published version can be withdrawn")
    public PassportVersionResponse withdrawPassport(@PathVariable UUID id, @Valid @RequestBody WithdrawRequest request) {
        return service.withdraw(currentUser.companyId(), currentUser.userId(), id, request.reason());
    }
}
