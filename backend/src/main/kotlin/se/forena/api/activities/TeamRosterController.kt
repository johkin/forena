package se.forena.api.activities

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.Parameter
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api/teams/{teamId}/roster")
class TeamRosterController(private val roster: TeamRosterService, private val actors: CurrentActorService) {
    @GetMapping("/access")
    @Operation(operationId = "getRosterAccess")
    fun access(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest, @PathVariable teamId: UUID): ResponseEntity<Boolean> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(roster.access(actors.from(authentication, request), teamId))

    @GetMapping
    @Operation(operationId = "getTeamRoster")
    fun get(@Parameter(hidden = true) authentication: Authentication,
            @Parameter(hidden = true) request: HttpServletRequest, @PathVariable teamId: UUID): ResponseEntity<TeamRosterSnapshot> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(roster.snapshot(actors.from(authentication, request), teamId))

    @PutMapping("/members/{personId}")
    @Operation(operationId = "renameRosterMember")
    @ApiResponse(responseCode = "204", description = "Member renamed")
    fun rename(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest, @PathVariable teamId: UUID,
               @PathVariable personId: UUID, @RequestBody command: RosterNameCommand): ResponseEntity<Void> {
        roster.rename(actors.from(authentication, request), teamId, personId, command)
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
    }

    @PostMapping("/groups")
    @Operation(operationId = "createRosterGroup")
    @ApiResponse(responseCode = "201", description = "Created subgroup", useReturnTypeSchema = true)
    fun create(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest, @PathVariable teamId: UUID,
               @RequestBody command: RosterGroupCommand): ResponseEntity<RosterSubgroup> =
        ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(roster.createGroup(actors.from(authentication, request), teamId, command))

    @PutMapping("/groups/{groupId}")
    @Operation(operationId = "updateRosterGroup")
    @ApiResponse(responseCode = "204", description = "Subgroup saved")
    fun update(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest, @PathVariable teamId: UUID,
               @PathVariable groupId: UUID, @RequestBody command: RosterGroupCommand): ResponseEntity<Void> {
        roster.updateGroup(actors.from(authentication, request), teamId, groupId, command)
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
    }

    @DeleteMapping("/groups/{groupId}")
    @Operation(operationId = "deleteRosterGroup")
    @ApiResponse(responseCode = "204", description = "Subgroup deleted")
    fun delete(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest, @PathVariable teamId: UUID,
               @PathVariable groupId: UUID, @RequestParam revision: Long): ResponseEntity<Void> {
        roster.deleteGroup(actors.from(authentication, request), teamId, groupId, revision)
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
    }
}
