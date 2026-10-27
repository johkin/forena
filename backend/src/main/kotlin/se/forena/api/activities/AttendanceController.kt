package se.forena.api.activities

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.responses.ApiResponse
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api/activities/{activityId}/attendance")
class AttendanceController(private val attendance: AttendanceService, private val actors: CurrentActorService) {
    @GetMapping("/access")
    @Operation(operationId = "getAttendanceAccess")
    fun access(@Parameter(hidden = true) authentication: Authentication,
               @Parameter(hidden = true) request: HttpServletRequest, @PathVariable activityId: UUID): ResponseEntity<Boolean> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(attendance.access(actors.from(authentication, request), activityId))

    @GetMapping
    @Operation(operationId = "getAttendance")
    fun get(@Parameter(hidden = true) authentication: Authentication,
            @Parameter(hidden = true) request: HttpServletRequest, @PathVariable activityId: UUID): ResponseEntity<AttendanceSnapshot> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(attendance.snapshot(actors.from(authentication, request), activityId))

    @PutMapping
    @Operation(operationId = "saveAttendance")
    @ApiResponse(responseCode = "204", description = "Attendance and history saved atomically")
    fun save(@Parameter(hidden = true) authentication: Authentication,
             @Parameter(hidden = true) request: HttpServletRequest, @PathVariable activityId: UUID,
             @RequestBody command: AttendanceCommand): ResponseEntity<Void> {
        attendance.save(actors.from(authentication, request), activityId, command)
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
    }
}
