package se.forena.api.activities

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.responses.ApiResponse
import se.forena.api.identity.CurrentActorService

@RestController
class ActivityManagementController(
    private val management: ActivityManagementService,
    private val actors: CurrentActorService
) {
    @GetMapping("/api/me/managed-teams")
    @Operation(operationId = "getManagedTeams")
    fun teams(@Parameter(hidden = true) authentication: Authentication,
              @Parameter(hidden = true) request: HttpServletRequest): ResponseEntity<List<ManagedTeam>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(management.teams(actors.from(authentication, request)))

    @GetMapping("/api/teams/{teamId}/activity-editor")
    @Operation(operationId = "getActivityEditor")
    fun editor(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest,
               @PathVariable teamId: UUID): ResponseEntity<ActivityEditorContext> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(management.context(actors.from(authentication, request), teamId))

    @PostMapping("/api/activities")
    @Operation(operationId = "createActivity")
    @ApiResponse(responseCode = "201", description = "Created activity", useReturnTypeSchema = true)
    fun create(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest,
               @RequestBody command: ActivityCommand): ResponseEntity<ActivityResult> =
        ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(management.create(actors.from(authentication, request), command))

    @PostMapping("/api/activity-series")
    @Operation(operationId = "createActivitySeries")
    @ApiResponse(responseCode = "201", description = "Created weekly activity series", useReturnTypeSchema = true)
    fun createSeries(@Parameter(hidden = true) authentication: Authentication,
                     @Parameter(hidden = true) request: HttpServletRequest,
                     @RequestBody command: ActivitySeriesCommand): ResponseEntity<ActivitySeriesResult> =
        ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(management.createSeries(actors.from(authentication, request), command))

    @PutMapping("/api/activities/{activityId}")
    @Operation(operationId = "updateActivity")
    fun update(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest,
               @PathVariable activityId: UUID, @RequestBody command: ActivityCommand): ResponseEntity<ActivityResult> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(management.update(actors.from(authentication, request), activityId, command))

    @DeleteMapping("/api/activities/{activityId}")
    @Operation(operationId = "cancelActivity")
    fun cancel(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest,
               @PathVariable activityId: UUID, @RequestBody(required = false) command: CancellationCommand?): ResponseEntity<ActivityDisposition> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(management.cancel(actors.from(authentication, request), activityId, command ?: CancellationCommand()))
}
