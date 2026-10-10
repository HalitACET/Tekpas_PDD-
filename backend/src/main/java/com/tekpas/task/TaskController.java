package com.tekpas.task;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.company.UserRole;
import com.tekpas.task.dto.TasksResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1/tasks", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "tasks", description = "What waits for the manufacturer (design v0.4 48)")
@ReadAccess
public class TaskController {

    private final TaskService service;
    private final CurrentUser currentUser;

    public TaskController(TaskService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(operationId = "getTasks", summary = "The company's open tasks and the menu badge count",
            description = "Batches that are not published only. Data waiting for approval is listed for OWNER and "
                    + "ADMIN, who can approve it.")
    @ApiResponse(responseCode = "200", description = "Tasks in three groups")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    public TasksResponse getTasks() {
        UserRole role = currentUser.role();
        return service.tasks(currentUser.companyId(), role == UserRole.OWNER || role == UserRole.ADMIN);
    }
}
