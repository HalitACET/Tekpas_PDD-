package com.tekpas.importer;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.WriteAccess;
import com.tekpas.importer.dto.ImportResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping(path = "/api/v1/imports")
@Tag(name = "imports", description = "Excel imports of products: template, upload, result (docs/m11-plan.md §4)")
@ReadAccess
public class ImportController {

    static final MediaType XLSX =
            MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final ImportService service;
    private final CurrentUser currentUser;

    public ImportController(ImportService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping(path = "/template")
    @WriteAccess
    @Operation(operationId = "downloadImportTemplate", summary = "The Excel template to fill in",
            description = "Headers in the given language (tr, en, de; tr otherwise), category and fibre lists, room for "
                    + "1000 products. Only this template is accepted.")
    @ApiResponse(responseCode = "200", description = "The .xlsx file",
            content = @Content(mediaType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    schema = @Schema(type = "string", format = "binary")))
    @ApiResponse(responseCode = "400", description = "Unknown kind (ImportKind)")
    public ResponseEntity<byte[]> downloadImportTemplate(@RequestParam String kind,
            @RequestParam(required = false) @Nullable String lang) {
        return ResponseEntity.ok()
                .contentType(XLSX)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("kozapass-products.xlsx").build().toString())
                .body(service.template(kind, lang));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "startImport", summary = "Upload a filled template",
            description = "The file is checked (an .xlsx of at most 1 MB, no macros) and queued; poll GET /imports/{id} "
                    + "until DONE or FAILED. Each valid row becomes a product; the others are reported by row and column.")
    @ApiResponse(responseCode = "202", description = "Queued")
    @ApiResponse(responseCode = "400", description = "file: FileSize, FileType, FileMacro, FileUnsafe; kind: ImportKind")
    @ApiResponse(responseCode = "403", description = "Viewers and suppliers do not import")
    public ResponseEntity<ImportResponse> startImport(@RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = ImportService.PRODUCTS) String kind) throws IOException {
        ImportResponse started = service.upload(currentUser.companyId(), currentUser.userId(), kind,
                file.getOriginalFilename(), file.getBytes());
        return ResponseEntity.accepted().location(URI.create("/api/v1/imports/" + started.id())).body(started);
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "listImports", summary = "The company's latest imports, newest first (errors left out)")
    public List<ImportResponse> listImports() {
        return service.list(currentUser.companyId());
    }

    @GetMapping(path = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "getImport", summary = "One import with its row errors")
    @ApiResponse(responseCode = "200", description = "The import; errors are listed once it is DONE")
    @ApiResponse(responseCode = "404", description = "No such import in this company")
    public ImportResponse getImport(@PathVariable UUID id) {
        return service.get(currentUser.companyId(), id);
    }
}
