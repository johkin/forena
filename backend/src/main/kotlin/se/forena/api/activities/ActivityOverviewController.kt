package se.forena.api.activities

import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import se.forena.api.http.ApiError
import se.forena.api.identity.Actor

@RestController
class ActivityOverviewController(private val overview: ActivityOverviewService) {
    @GetMapping("/api/me/activities", produces = ["application/json"])
    @Operation(operationId = "getMyActivities", description = "Own and delegated person access. Invitation-backed, ongoing/upcoming scheduled activities starting within 90 days; includes declined and not-yet-sent invitations. Each activity includes only sent invitations for authorized people, with current responses; future invitations remain hidden. Stable starts_at/id order, 50 activities per page, no duplicates. No-store. Offset 0..100000; concurrent changes may shift pages.")
    @ApiResponse(responseCode = "200", description = "My activities", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", description = "Invalid offset", content = [Content(schema = Schema(implementation = ApiError::class))])
    @ApiResponse(responseCode = "401", description = "Inactive session", content = [Content(schema = Schema(implementation = ApiError::class))])
    @ApiResponse(responseCode = "503", description = "Session verification unavailable", content = [Content(schema = Schema(implementation = ApiError::class))])
    fun list(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt,
             @RequestParam(defaultValue = "0") offset: Int): ResponseEntity<MyActivities> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(overview.list(
            Actor(UUID.fromString(jwt.subject), UUID.fromString(jwt.getClaimAsString("session_id")), jwt.tokenValue), offset))
}
