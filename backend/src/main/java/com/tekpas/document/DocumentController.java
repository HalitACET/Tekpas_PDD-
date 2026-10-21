package com.tekpas.document;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.ReviewAccess;
import com.tekpas.common.security.WriteAccess;
import com.tekpas.document.DocumentService.FileLink;
import com.tekpas.document.dto.AwaitingDocument;
import com.tekpas.document.dto.DocumentResponse;
import com.tekpas.document.dto.VerifyDocumentRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "documents", description = "Certificates and technical sheets of a step (M5)")
@ReadAccess
public class DocumentController {

    private final DocumentService service;
    private final AwaitingDocuments awaiting;
    private final CurrentUser currentUser;

    public DocumentController(DocumentService service, AwaitingDocuments awaiting, CurrentUser currentUser) {
        this.service = service;
        this.awaiting = awaiting;
        this.currentUser = currentUser;
    }

    @PostMapping(path = "/steps/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @WriteAccess
    @Operation(operationId = "uploadDocument", summary = "Upload a certificate or technical sheet to a step",
            description = "PDF, JPG or PNG, up to 10 MB (PDF up to 20 pages, not encrypted). The type is read from "
                    + "the file's bytes, not its name. The document is stored and queued for reading; nothing it "
                    + "contains is applied until a person confirms it. At most 10 documents per step.")
    @ApiResponse(responseCode = "202", description = "Stored; reading is queued")
    @ApiResponse(responseCode = "400", description = "The file is refused: field file, code FileEmpty, "
            + "FileEncrypted, FileCorrupt, FilePages or FileDimensions")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such step in this company")
    @ApiResponse(responseCode = "409", description = "DUPLICATE_DOCUMENT (same file on the step), DOCUMENT_LIMIT, "
            + "or BATCH_PUBLISHED")
    @ApiResponse(responseCode = "413", description = "Larger than 10 MB (field file, code FileTooLarge)")
    @ApiResponse(responseCode = "415", description = "Not a PDF, JPG or PNG (field file, code FileType)")
    @ApiResponse(responseCode = "429", description = "Too many uploads (Retry-After)")
    @ApiResponse(responseCode = "502", description = "The file storage failed")
    @ApiResponse(responseCode = "503", description = "File storage is not configured (STORAGE_PROVIDER)")
    public ResponseEntity<DocumentResponse> uploadDocument(@PathVariable UUID id,
            @RequestPart("file") MultipartFile file, @RequestParam(required = false) @Nullable DocType docType) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(service.upload(currentUser.companyId(), currentUser.userId(), id, file, docType));
    }

    @PostMapping(path = "/steps/{id}/documents/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @WriteAccess
    @Operation(operationId = "uploadDocumentPhotos", summary = "Upload the photographed pages of one document",
            description = "1 to 10 JPG or PNG pages, 10 MB together (the mobile app, M8). The server checks every page, "
                    + "draws it again without its metadata (location, camera), scales it to 2000 px at most and joins "
                    + "the pages into one PDF; then it is stored and read like an uploaded document.")
    @ApiResponse(responseCode = "200", description = "The Idempotency-Key was seen before: the document that upload made")
    @ApiResponse(responseCode = "202", description = "Stored as one PDF; reading is queued")
    @ApiResponse(responseCode = "400", description = "Field pages (PageCount) or pages[i] (FileEmpty, FileCorrupt, "
            + "FileDimensions), or an Idempotency-Key that is not a UUID")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such step in this company")
    @ApiResponse(responseCode = "409", description = "DUPLICATE_DOCUMENT, DOCUMENT_LIMIT, BATCH_PUBLISHED, or "
            + "UPLOAD_KEY_REUSED (the Idempotency-Key belongs to an upload to another step)")
    @ApiResponse(responseCode = "413", description = "Larger than 10 MB together (field pages, code FileTooLarge)")
    @ApiResponse(responseCode = "415", description = "A page is not a JPG or PNG (field pages[i], code FileType)")
    @ApiResponse(responseCode = "429", description = "Too many uploads (Retry-After)")
    public ResponseEntity<DocumentResponse> uploadDocumentPhotos(@PathVariable UUID id,
            @RequestPart("pages") List<MultipartFile> pages, @RequestParam(required = false) @Nullable DocType docType,
            @Parameter(description = "A UUID the app makes once per upload and sends again with every retry (M9 "
                    + "upload queue): the same key never makes a second document")
            @RequestHeader(name = "Idempotency-Key", required = false) @Nullable UUID idempotencyKey) {
        DocumentService.PhotoUpload upload = service.uploadPhotos(currentUser.companyId(), currentUser.userId(), id,
                pages, docType, idempotencyKey);
        return ResponseEntity.status(upload.repeated() ? HttpStatus.OK : HttpStatus.ACCEPTED).body(upload.document());
    }

    @GetMapping("/documents/awaiting-review")
    @Operation(operationId = "listDocumentsAwaitingReview", summary = "Documents read and waiting for a person, newest first",
            description = "The company's unconfirmed documents whose reading is over (read, partly read, unreadable or "
                    + "failed), at most 50, each with its batch, step and supplier (the mobile Görevlerim, M8).")
    @ApiResponse(responseCode = "200", description = "The documents")
    @ApiResponse(responseCode = "403", description = "Supplier user")
    public List<AwaitingDocument> listDocumentsAwaitingReview() {
        return awaiting.of(currentUser.companyId());
    }

    @GetMapping("/steps/{id}/documents")
    @Operation(operationId = "listStepDocuments", summary = "The step's documents, newest first")
    @ApiResponse(responseCode = "200", description = "At most 10")
    @ApiResponse(responseCode = "403", description = "Supplier user")
    @ApiResponse(responseCode = "404", description = "No such step in this company")
    public List<DocumentResponse> listStepDocuments(@PathVariable UUID id) {
        return service.list(currentUser.companyId(), id);
    }

    @GetMapping("/documents/{id}")
    @Operation(operationId = "getDocument", summary = "One document")
    @ApiResponse(responseCode = "403", description = "Supplier user")
    @ApiResponse(responseCode = "404", description = "No such document in this company")
    public DocumentResponse getDocument(@PathVariable UUID id) {
        return service.get(currentUser.companyId(), id);
    }

    @GetMapping(path = "/documents/{id}/file", produces = MediaType.ALL_VALUE)
    @Operation(operationId = "downloadDocument", summary = "The file, through a 60 second signed link",
            description = "Answers 302 to a signed link on the storage's own origin (a browser client fetches it "
                    + "with its bearer token and the redirect strips the header). With the local development "
                    + "storage the bytes are returned directly. download=true makes it an attachment.")
    @ApiResponse(responseCode = "200", description = "The bytes (local development storage only)")
    @ApiResponse(responseCode = "302", description = "Signed link in Location")
    @ApiResponse(responseCode = "403", description = "Supplier user")
    @ApiResponse(responseCode = "404", description = "No such document in this company")
    @ApiResponse(responseCode = "502", description = "The file storage failed")
    @ApiResponse(responseCode = "503", description = "File storage is not configured (STORAGE_PROVIDER)")
    public ResponseEntity<Resource> downloadDocument(@PathVariable UUID id,
            @RequestParam(defaultValue = "false") boolean download) {
        FileLink link = service.fileLink(currentUser.companyId(), id, download);
        if ("file".equals(link.url().getScheme())) {
            ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
                    .filename(link.fileName(), StandardCharsets.UTF_8).build();
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(link.mimeType()))
                    .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Content-Security-Policy", "sandbox")
                    .cacheControl(CacheControl.noStore())
                    .body(new FileSystemResource(Path.of(link.url())));
        }
        return ResponseEntity.status(HttpStatus.FOUND).location(link.url()).cacheControl(CacheControl.noStore())
                .build();
    }

    @PostMapping(path = "/documents/{id}/verify", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ReviewAccess
    @Operation(operationId = "verifyDocument", summary = "Confirm what was read from a document",
            description = "OWNER and ADMIN only. The values in the body (type, certificate number, holder, issuer, "
                    + "validity) become the document's real fields; they are the person's, whether they kept the "
                    + "proposal, corrected it or typed them. Each field is recorded as ACCEPTED, EDITED or ADDED "
                    + "against the reading's proposal. Works the same for a document the reading could not read "
                    + "(manual entry). Writes a DOCUMENT_VERIFIED event on the step. The reading itself is not "
                    + "changed.")
    @ApiResponse(responseCode = "200", description = "The document, now VERIFIED")
    @ApiResponse(responseCode = "400", description = "Validation failed (docType OneOf when UNKNOWN, validUntil "
            + "DateRange)")
    @ApiResponse(responseCode = "422", description = "A certificate (OEKO_TEX, GOTS, GRS, BCI, OCS, BLUESIGN) needs "
            + "certNo and validUntil: one NotNull error per missing field. Other types need neither.")
    @ApiResponse(responseCode = "403", description = "Not OWNER or ADMIN")
    @ApiResponse(responseCode = "404", description = "No such document in this company")
    @ApiResponse(responseCode = "409", description = "DOCUMENT_VERIFIED, DOCUMENT_NOT_READ (still being read) or "
            + "BATCH_PUBLISHED")
    public DocumentResponse verifyDocument(@PathVariable UUID id, @Valid @RequestBody VerifyDocumentRequest body) {
        return service.verify(currentUser.companyId(), currentUser.userId(), id, body);
    }

    @PostMapping("/documents/{id}/reread")
    @WriteAccess
    @Operation(operationId = "rereadDocument", summary = "Read a document again",
            description = "A reading that ended FAILED (design v0.5 57e \"Tekrar oku\"), or one left UNREADABLE while "
                    + "the LLM gate is open for the company (the LLM may read what the rules could not): the document "
                    + "goes back in the queue as if just uploaded and answers 202 with its new state (QUEUED). "
                    + "DocumentResponse.rereadable says when this works. Anything else (read, in progress, "
                    + "unreadable with the gate closed, confirmed) is 409 DOCUMENT_NOT_REREADABLE.")
    @ApiResponse(responseCode = "202", description = "Queued again")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such document in this company")
    @ApiResponse(responseCode = "409", description = "DOCUMENT_NOT_REREADABLE or BATCH_PUBLISHED")
    @ApiResponse(responseCode = "429", description = "Too many attempts (Retry-After)")
    public ResponseEntity<DocumentResponse> rereadDocument(@PathVariable UUID id) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.reread(currentUser.companyId(), id));
    }

    @DeleteMapping("/documents/{id}")
    @WriteAccess
    @Operation(operationId = "deleteDocument", summary = "Remove a document nobody verified yet")
    @ApiResponse(responseCode = "204", description = "Removed, with its file")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such document in this company")
    @ApiResponse(responseCode = "409", description = "DOCUMENT_VERIFIED or BATCH_PUBLISHED")
    public ResponseEntity<Void> deleteDocument(@PathVariable UUID id) {
        service.remove(currentUser.companyId(), currentUser.userId(), id);
        return ResponseEntity.noContent().build();
    }
}
