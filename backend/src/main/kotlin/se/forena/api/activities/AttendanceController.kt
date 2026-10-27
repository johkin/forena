package se.forena.api.activities

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
class AttendanceController(private val attendance: AttendanceService, private val actors: CurrentActorService) {
    @GetMapping("/api/activities/{activityId}/attendance")
    @Operation(operationId = "getActivityAttendance")
    fun read(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
             @PathVariable activityId: UUID): ResponseEntity<AttendanceSnapshot> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(attendance.read(actors.from(authentication, request), activityId))

    @PutMapping("/api/activities/{activityId}/attendance")
    @Operation(operationId = "reportActivityAttendance")
    fun report(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
               @PathVariable activityId: UUID, @RequestBody command: AttendanceCommand): ResponseEntity<AttendanceSnapshot> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(attendance.report(actors.from(authentication, request), activityId, command))
}
