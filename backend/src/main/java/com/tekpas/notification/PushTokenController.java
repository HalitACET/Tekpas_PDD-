package com.tekpas.notification;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.notification.dto.PushTokenRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1/me/push-tokens", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "notifications", description = "The current user's phones for push notifications")
@ReadAccess
public class PushTokenController {

    private final PushTokenService service;
    private final CurrentUser currentUser;

    public PushTokenController(PushTokenService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "registerPushToken", summary = "Receive notifications on this phone",
            description = "Binds the Expo push token to the current user; a token another user had moves to this one "
                    + "(the phone changed hands). Calling it again only marks the token as seen.")
    @ApiResponse(responseCode = "204", description = "Registered")
    @ApiResponse(responseCode = "400", description = "Not an Expo push token, or no platform")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    public ResponseEntity<Void> registerPushToken(@Valid @RequestBody PushTokenRequest request) {
        service.register(currentUser.userId(), request.token(), request.platform());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    @Operation(operationId = "removePushToken", summary = "Stop notifications on this phone",
            description = "On sign-out and when notifications are switched off in the app. The token goes in the "
                    + "query: its brackets are not allowed in a path.")
    @ApiResponse(responseCode = "204", description = "Removed")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "Not one of the current user's tokens")
    public ResponseEntity<Void> removePushToken(@RequestParam String token) {
        service.remove(currentUser.userId(), token);
        return ResponseEntity.noContent().build();
    }
}
