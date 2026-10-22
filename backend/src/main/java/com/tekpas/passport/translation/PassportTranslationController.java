package com.tekpas.passport.translation;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.ReviewAccess;
import com.tekpas.passport.translation.dto.TranslationsResponse;
import com.tekpas.passport.translation.dto.TranslationsUpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1/batches/{id}/translations", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "translations", description = "Translations of a batch's free texts for its passport, approved before "
        + "publishing (docs/m11-plan.md §3)")
@ReadAccess
public class PassportTranslationController {

    private final PassportTranslations service;
    private final CurrentUser currentUser;

    public PassportTranslationController(PassportTranslations service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(operationId = "getTranslations", summary = "The batch's free texts and their translations",
            description = "Product description, care note, a step's fabric type and \"other\" dyeing process; the "
                    + "product name and names of companies and places are not translated.")
    @ApiResponse(responseCode = "200", description = "The texts")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    public TranslationsResponse getTranslations(@PathVariable UUID id) {
        return service.get(currentUser.companyId(), id);
    }

    @PostMapping("/suggest")
    @ReviewAccess
    @Operation(operationId = "suggestTranslations", summary = "Ask the AI for translations (demo companies only)",
            description = "Queues one suggestion for the texts without an approved or hand-written translation; the "
                    + "suggestions arrive unapproved. Poll GET until suggesting is false.")
    @ApiResponse(responseCode = "202", description = "Queued")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    @ApiResponse(responseCode = "409", description = "AI_NOT_AVAILABLE (not a demo company or the LLM is off) or "
            + "NOTHING_TO_TRANSLATE")
    public ResponseEntity<TranslationsResponse> suggestTranslations(@PathVariable UUID id) {
        return ResponseEntity.accepted().body(service.suggest(currentUser.companyId(), id));
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ReviewAccess
    @Operation(operationId = "saveTranslations", summary = "Edit, approve or remove translations",
            description = "Only approved translations of the texts as they are now go into the next published "
                    + "version. Changing an AI suggestion makes it the user's.")
    @ApiResponse(responseCode = "200", description = "Saved")
    @ApiResponse(responseCode = "400", description = "TranslationField, TranslationLanguage or a validation error")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    public TranslationsResponse saveTranslations(@PathVariable UUID id,
            @Valid @RequestBody TranslationsUpdateRequest request) {
        return service.save(currentUser.companyId(), currentUser.userId(), id, request);
    }
}
