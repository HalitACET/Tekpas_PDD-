package com.tekpas.company;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.OwnerAccess;
import com.tekpas.common.security.ReviewAccess;
import com.tekpas.company.dto.UserInvitation;
import com.tekpas.company.dto.UserInviteRequest;
import com.tekpas.company.dto.UserResponse;
import com.tekpas.company.dto.UserUpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1/users", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "users", description = "The company's users and their roles (PLAN.md §2, docs/m12-plan.md §5)")
public class UserController {

    private final UserService service;
    private final CurrentUser currentUser;

    public UserController(UserService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @ReviewAccess
    @Operation(operationId = "listUsers", summary = "The company's users, suppliers' users left out")
    @ApiResponse(responseCode = "200", description = "The users, by name")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN")
    public List<UserResponse> listUsers() {
        return service.list(currentUser.companyId(), currentUser.userId());
    }

    @PostMapping(path = "/invitations", consumes = MediaType.APPLICATION_JSON_VALUE)
    @OwnerAccess
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "inviteUser", summary = "Invite a colleague: an inactive user and a one-time link",
            description = "No e-mail is sent: the link (/davet#<token>, 7 days) is shared by the owner. The token is "
                    + "in this answer only.")
    @ApiResponse(responseCode = "201", description = "Invited")
    @ApiResponse(responseCode = "400", description = "Validation failed (InviteRole for a supplier role)")
    @ApiResponse(responseCode = "403", description = "Only the OWNER")
    @ApiResponse(responseCode = "409", description = "The e-mail is already registered (field error Unique)")
    public UserInvitation inviteUser(@Valid @RequestBody UserInviteRequest request) {
        return service.invite(currentUser.companyId(), currentUser.userId(), request);
    }

    @PostMapping("/{id}/invitations")
    @OwnerAccess
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "renewUserInvitation", summary = "A new invitation link; the old one stops working")
    @ApiResponse(responseCode = "201", description = "Renewed")
    @ApiResponse(responseCode = "403", description = "Only the OWNER")
    @ApiResponse(responseCode = "404", description = "No such user in this company")
    @ApiResponse(responseCode = "409", description = "NOT_INVITED: the user has already joined")
    public UserInvitation renewUserInvitation(@PathVariable UUID id) {
        return service.renewInvitation(currentUser.companyId(), currentUser.userId(), id);
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @OwnerAccess
    @Operation(operationId = "updateUser", summary = "Change a user's role, deactivate or reactivate",
            description = "A deactivated user is signed out everywhere; their work and audit entries stay.")
    @ApiResponse(responseCode = "200", description = "Updated")
    @ApiResponse(responseCode = "400", description = "Validation failed (InviteRole for a supplier role)")
    @ApiResponse(responseCode = "403", description = "Only the OWNER")
    @ApiResponse(responseCode = "404", description = "No such user in this company")
    @ApiResponse(responseCode = "409", description = "SELF (own account), LAST_OWNER (the company's last active "
            + "owner), INVITATION_PENDING (not joined yet: renew the invitation)")
    public UserResponse updateUser(@PathVariable UUID id, @Valid @RequestBody UserUpdateRequest request) {
        return service.update(currentUser.companyId(), currentUser.userId(), id, request);
    }
}
